import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, mkdir, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import { StratosphereError } from "./errors.js";
import type {
  ArtifactBundle,
  RepositoryExportAction,
  RepositoryExportRequest,
  RepositoryExportResult,
} from "./types.js";

type ExecutionPolicy = {
  requested: boolean;
  allowed: boolean;
  tokenEnvVar: string;
  token?: string;
  reference: string;
  reason?: string;
};

type ApiResponse = {
  status: number;
  json: Record<string, unknown> | null;
  text: string;
};

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 30_000;

function assertMatches(input: string, pattern: RegExp, field: string, hint: string): void {
  if (pattern.test(input)) return;
  throw new StratosphereError({
    code: "INPUT_INVALID",
    message: `Invalid ${field}: ${input}`,
    hint,
  });
}

function validateRepositoryRequest(request: RepositoryExportRequest): void {
  assertMatches(
    request.owner,
    /^[a-zA-Z0-9_.\-/]{1,128}$/,
    "export owner",
    "Use letters, numbers, dash, underscore, dot, slash."
  );
  assertMatches(
    request.repository,
    /^[a-zA-Z0-9_.-]{1,128}$/,
    "export repository",
    "Use letters, numbers, dash, underscore, dot."
  );
  assertMatches(
    desiredBranchName(request),
    /^[a-zA-Z0-9_./-]{1,255}$/,
    "export branch",
    "Use letters, numbers, dash, underscore, dot, slash."
  );
  assertMatches(
    targetBranchName(request),
    /^[a-zA-Z0-9_./-]{1,255}$/,
    "export target branch",
    "Use letters, numbers, dash, underscore, dot, slash."
  );
  if (request.executionTokenEnvVar) {
    assertMatches(
      request.executionTokenEnvVar,
      /^[A-Z_][A-Z0-9_]{1,127}$/,
      "export token env var",
      "Use uppercase env var format, for example GITHUB_TOKEN."
    );
  }
}

function desiredBranchName(request: RepositoryExportRequest): string {
  return request.branchName ?? "codex/stratosphere-migration";
}

function targetBranchName(request: RepositoryExportRequest): string {
  return request.targetBranch ?? "main";
}

function defaultApiBaseUrl(request: RepositoryExportRequest): string {
  if (request.provider === "github") return "https://api.github.com";
  return "https://gitlab.com/api/v4";
}

function defaultWebBaseUrl(request: RepositoryExportRequest): string {
  if (request.provider === "github") return "https://github.com";
  return "https://gitlab.com";
}

function resolveExecutionPolicy(request: RepositoryExportRequest): ExecutionPolicy {
  const requested = !(request.dryRun ?? true);
  const tokenEnvVar = request.executionTokenEnvVar ?? (request.provider === "github" ? "GITHUB_TOKEN" : "GITLAB_TOKEN");
  const token = process.env[tokenEnvVar];
  const policyEnabled = process.env.STRATOSPHERE_ENABLE_EXPORT_EXECUTION === "true";
  const reference = `${request.owner}/${request.repository}@${desiredBranchName(request)}`;

  if (!requested) {
    return {
      requested: false,
      allowed: false,
      tokenEnvVar,
      reference,
      reason: "Dry-run mode enabled.",
    };
  }

  if (!policyEnabled) {
    return {
      requested: true,
      allowed: false,
      tokenEnvVar,
      reference,
      reason: "Export execution policy is disabled.",
    };
  }

  if (!token) {
    return {
      requested: true,
      allowed: false,
      tokenEnvVar,
      reference,
      reason: `Missing required token environment variable: ${tokenEnvVar}.`,
    };
  }

  return {
    requested: true,
    allowed: true,
    tokenEnvVar,
    token,
    reference,
  };
}

function makeBaseActions(request: RepositoryExportRequest, status: RepositoryExportAction["status"]): RepositoryExportAction[] {
  return [
    {
      kind: "create-repository",
      description: `Create ${request.provider} repository ${request.owner}/${request.repository}`,
      status,
    },
    {
      kind: "create-branch",
      description: `Create migration artifacts branch (${desiredBranchName(request)})`,
      status,
    },
    {
      kind: "push-artifacts",
      description: "Push generated artifacts and reports",
      status,
    },
    {
      kind: "open-merge-request",
      description: request.provider === "github" ? "Open pull request" : "Open merge request",
      status,
    },
  ];
}

/* c8 ignore start - integration paths require live provider/network and git remotes */
async function apiRequest(
  method: string,
  url: string,
  token: string,
  body?: Record<string, unknown>
): Promise<ApiResponse> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "stratosphere-exporter/0.1",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

function visibilityToGitLab(value?: "private" | "internal" | "public"): "private" | "internal" | "public" {
  return value ?? "private";
}

function visibilityToGitHubPrivate(value?: "private" | "internal" | "public"): boolean {
  if (!value) return true;
  return value !== "public";
}

async function ensureGitHubRepository(request: RepositoryExportRequest, token: string): Promise<void> {
  const apiBase = request.providerApiBaseUrl ?? defaultApiBaseUrl(request);
  const repoUrl = `${apiBase}/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repository)}`;
  const existing = await apiRequest("GET", repoUrl, token);
  if (existing.status === 200) return;
  if (existing.status !== 404) {
    throw new StratosphereError({
      code: "PIPELINE_FAILED",
      message: `GitHub repository lookup failed with status ${existing.status}.`,
      hint: "Verify token scope and API endpoint configuration.",
    });
  }

  const createOrgUrl = `${apiBase}/orgs/${encodeURIComponent(request.owner)}/repos`;
  const createBody: Record<string, unknown> = {
    name: request.repository,
    private: visibilityToGitHubPrivate(request.visibility),
    visibility: request.visibility,
  };
  let created = await apiRequest("POST", createOrgUrl, token, createBody);
  if (created.status === 201) return;

  const createUserUrl = `${apiBase}/user/repos`;
  created = await apiRequest("POST", createUserUrl, token, createBody);
  if (created.status === 201) return;

  throw new StratosphereError({
    code: "PIPELINE_FAILED",
    message: `GitHub repository create failed with status ${created.status}.`,
    hint: "Ensure OAuth/token has repository create rights in the target owner.",
  });
}

async function ensureGitLabProject(request: RepositoryExportRequest, token: string): Promise<void> {
  const apiBase = request.providerApiBaseUrl ?? defaultApiBaseUrl(request);
  const projectPath = `${request.owner}/${request.repository}`;
  const projectEncoded = encodeURIComponent(projectPath);
  const lookupUrl = `${apiBase}/projects/${projectEncoded}`;
  const existing = await apiRequest("GET", lookupUrl, token);
  if (existing.status === 200) return;
  if (existing.status !== 404) {
    throw new StratosphereError({
      code: "PIPELINE_FAILED",
      message: `GitLab project lookup failed with status ${existing.status}.`,
      hint: "Verify token scope and API endpoint configuration.",
    });
  }

  const createUrl = `${apiBase}/projects`;
  const created = await apiRequest("POST", createUrl, token, {
    name: request.repository,
    path: request.repository,
    visibility: visibilityToGitLab(request.visibility),
  });

  if (created.status === 201) return;

  throw new StratosphereError({
    code: "PIPELINE_FAILED",
    message: `GitLab project create failed with status ${created.status}.`,
    hint:
      "For group-owned projects, pre-create the project or provide a token scoped to create projects in target namespace.",
  });
}

async function gitExec(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
}

async function copyDirectoryRecursive(sourceDir: string, destinationDir: string): Promise<void> {
  await mkdir(destinationDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const from = join(sourceDir, entry.name);
    const to = join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryRecursive(from, to);
      continue;
    }
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
  }
}

function remoteUrlWithToken(request: RepositoryExportRequest, token: string): string {
  const webBase = request.providerWebBaseUrl ?? defaultWebBaseUrl(request);
  const stripped = webBase.replace(/^https?:\/\//, "");
  const escapedToken = encodeURIComponent(token);
  if (request.provider === "github") {
    return `https://x-access-token:${escapedToken}@${stripped}/${request.owner}/${request.repository}.git`;
  }
  return `https://oauth2:${escapedToken}@${stripped}/${request.owner}/${request.repository}.git`;
}

async function pushBundleToRepository(bundleDir: string, request: RepositoryExportRequest, token: string): Promise<void> {
  const workRoot = await mkdtemp(join(tmpdir(), "stratosphere-export-"));
  try {
    const repoDir = join(workRoot, "repo");
    await copyDirectoryRecursive(bundleDir, repoDir);
    await gitExec(["init"], repoDir);
    await gitExec(["config", "user.name", request.commitAuthorName ?? "stratosphere-bot"], repoDir);
    await gitExec(["config", "user.email", request.commitAuthorEmail ?? "stratosphere-bot@local"], repoDir);
    await gitExec(["checkout", "-b", desiredBranchName(request)], repoDir);
    await gitExec(["add", "."], repoDir);
    await gitExec(["commit", "-m", "Stratosphere migration bundle"], repoDir);
    await gitExec(["remote", "add", "origin", remoteUrlWithToken(request, token)], repoDir);
    await gitExec(["push", "--set-upstream", "origin", desiredBranchName(request)], repoDir);
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

async function openGitHubPullRequest(request: RepositoryExportRequest, token: string): Promise<string | undefined> {
  const apiBase = request.providerApiBaseUrl ?? defaultApiBaseUrl(request);
  const url = `${apiBase}/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repository)}/pulls`;
  const response = await apiRequest("POST", url, token, {
    title: "Stratosphere migration bundle",
    head: desiredBranchName(request),
    base: targetBranchName(request),
    body: "Automated migration bundle generated by Stratosphere.",
  });
  if (response.status === 201 || response.status === 200) {
    const value = response.json?.html_url;
    return typeof value === "string" ? value : undefined;
  }
  if (response.status === 422) return undefined;
  throw new StratosphereError({
    code: "PIPELINE_FAILED",
    message: `GitHub pull request create failed with status ${response.status}.`,
    hint: "Verify target branch, permissions, and repository settings.",
  });
}

async function openGitLabMergeRequest(request: RepositoryExportRequest, token: string): Promise<string | undefined> {
  const apiBase = request.providerApiBaseUrl ?? defaultApiBaseUrl(request);
  const projectPath = `${request.owner}/${request.repository}`;
  const projectEncoded = encodeURIComponent(projectPath);
  const url = `${apiBase}/projects/${projectEncoded}/merge_requests`;
  const response = await apiRequest("POST", url, token, {
    source_branch: desiredBranchName(request),
    target_branch: targetBranchName(request),
    title: "Stratosphere migration bundle",
    description: "Automated migration bundle generated by Stratosphere.",
  });
  if (response.status === 201 || response.status === 200) {
    const value = response.json?.web_url;
    return typeof value === "string" ? value : undefined;
  }
  if (response.status === 409) return undefined;
  throw new StratosphereError({
    code: "PIPELINE_FAILED",
    message: `GitLab merge request create failed with status ${response.status}.`,
    hint: "Verify target branch, permissions, and project settings.",
  });
}
/* c8 ignore stop */

async function executeExport(bundleDir: string, request: RepositoryExportRequest, token: string): Promise<string | undefined> {
  if (request.provider === "github") {
    await ensureGitHubRepository(request, token);
    await pushBundleToRepository(bundleDir, request, token);
    return openGitHubPullRequest(request, token);
  }

  await ensureGitLabProject(request, token);
  await pushBundleToRepository(bundleDir, request, token);
  return openGitLabMergeRequest(request, token);
}

function plannedResult(
  bundle: ArtifactBundle,
  request: RepositoryExportRequest,
  policy: ExecutionPolicy
): RepositoryExportResult {
  const status: RepositoryExportAction["status"] = policy.requested ? (policy.allowed ? "executed" : "failed") : "planned";
  return {
    provider: request.provider,
    dryRun: request.dryRun ?? true,
    actions: makeBaseActions(request, status),
    warnings: [
      policy.reason ?? "Export execution policy checks passed.",
      `Auth mode: ${request.authMode ?? "token"}`,
      `Token source: ${policy.tokenEnvVar}`,
      `Planned artifact file count: ${bundle.artifacts.length}`,
    ],
    execution: {
      requested: policy.requested,
      executed: policy.allowed,
      reference: policy.reference,
      reason: policy.reason,
    },
  };
}

export function planRepositoryExport(
  bundle: ArtifactBundle,
  request?: RepositoryExportRequest
): RepositoryExportResult | undefined {
  if (!request) return undefined;
  if (request.provider !== "github" && request.provider !== "gitlab") {
    return {
      provider: request.provider,
      dryRun: true,
      actions: [],
      warnings: [`No exporter configured for provider: ${request.provider}`],
      execution: {
        requested: false,
        executed: false,
        reason: `No exporter configured for provider: ${request.provider}`,
      },
    };
  }
  validateRepositoryRequest(request);
  const policy = resolveExecutionPolicy(request);
  return plannedResult(bundle, request, policy);
}

export async function runRepositoryExport(
  bundleDir: string,
  bundle: ArtifactBundle,
  request?: RepositoryExportRequest
): Promise<RepositoryExportResult | undefined> {
  if (!request) return undefined;
  const planned = planRepositoryExport(bundle, request);
  if (!planned) return undefined;
  if (planned.actions.length === 0) return planned;

  const policy = resolveExecutionPolicy(request);
  const result = plannedResult(bundle, request, policy);
  if (!policy.requested || !policy.allowed || !policy.token) return result;

  try {
    const pullRequestUrl = await executeExport(bundleDir, request, policy.token);
    result.execution = {
      ...result.execution,
      requested: true,
      executed: true,
      pullRequestUrl,
      reason: undefined,
    };
    result.actions = makeBaseActions(request, "executed");
    if (pullRequestUrl) {
      result.warnings.push(`Change request opened: ${pullRequestUrl}`);
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown export failure";
    result.execution = {
      ...result.execution,
      requested: true,
      executed: false,
      reason: message,
    };
    result.actions = makeBaseActions(request, "failed");
    result.warnings.push(`Execution failed: ${message}`);
    return result;
  }
}

export const __repositoryExportTestables = {
  validateRepositoryRequest,
  desiredBranchName,
  targetBranchName,
  defaultApiBaseUrl,
  defaultWebBaseUrl,
};
