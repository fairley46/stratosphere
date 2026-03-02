import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  StratosphereError,
  getSshDiscoveryCommandSet,
  runMigrationPipeline,
  sanitizeErrorDetails,
  summarizeRun,
  toErrorPayload,
  toUserFacingError,
  validateApplicationWorkspace,
  validateBusinessIntake,
  type ApplicationWorkspace,
  type BusinessIntake,
  type DiscoveryMode,
  type MigrationStrategy,
  type MigrationRunRequest,
  type RepositoryExportRequest,
  type RuntimeSnapshot,
  type VmConnection,
} from "@stratosphere/engine";
import { runGuidedIntakeWizard } from "./wizard.js";

type ArgMap = Record<string, string | boolean>;
const INVOKE_CWD = process.env.INIT_CWD ?? process.cwd();

function parseArgs(argv: string[]): ArgMap {
  const out: ArgMap = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new StratosphereError({
        code: "INPUT_INVALID",
        message: `Unexpected positional argument: ${token}`,
        hint: "Use --help to view supported flags.",
      });
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }

    out[key] = next;
    index += 1;
  }

  return out;
}

function getString(args: ArgMap, key: string, fallback?: string): string {
  const value = args[key];
  if (typeof value === "string") return value;
  if (fallback !== undefined) return fallback;

  throw new StratosphereError({
    code: "INPUT_MISSING",
    message: `Missing required argument --${key}`,
    hint: "Provide the required flag and try again.",
    details: { key },
  });
}

function getOptionalString(args: ArgMap, key: string): string | undefined {
  const value = args[key];
  if (typeof value === "string") return value;
  return undefined;
}

function assertMatches(value: string, pattern: RegExp, message: string, hint: string): void {
  if (pattern.test(value)) return;
  throw new StratosphereError({
    code: "INPUT_INVALID",
    message,
    hint,
    details: { value },
  });
}

function getBool(args: ArgMap, key: string): boolean {
  const value = args[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return false;
}

function getOptionalNumber(args: ArgMap, key: string): number | undefined {
  const raw = getOptionalString(args, key);
  if (!raw) return undefined;

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new StratosphereError({
      code: "INPUT_INVALID",
      message: `Invalid numeric argument for --${key}: ${raw}`,
      hint: "Provide an integer value.",
      details: { key, value: raw },
    });
  }

  return parsed;
}

function loadSnapshot(runtimeFile: string): RuntimeSnapshot {
  const parsed = loadJsonFile(runtimeFile, "runtime snapshot");
  return parsed as RuntimeSnapshot;
}

function loadJsonFile(filePath: string, label: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new StratosphereError({
      code: "FILE_READ_FAILED",
      message: `Unable to read ${label} file: ${filePath}`,
      hint: "Check that the file exists and is readable.",
      details: { filePath, reason: String(error) },
    });
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new StratosphereError({
      code: "JSON_PARSE_FAILED",
      message: `Invalid JSON in ${label} file: ${filePath}`,
      hint: "Validate JSON syntax and required fields.",
      details: { filePath, reason: String(error) },
    });
  }
}

function parseConnection(args: ArgMap): VmConnection | undefined {
  const host = getOptionalString(args, "ssh-host");
  const user = getOptionalString(args, "ssh-user");

  if ((host && !user) || (!host && user)) {
    throw new StratosphereError({
      code: "INPUT_MISSING",
      message: "SSH mode requires both --ssh-host and --ssh-user.",
      hint: "Provide both flags or remove both to use snapshot/local mode.",
      details: { hostProvided: Boolean(host), userProvided: Boolean(user) },
    });
  }

  if (!host || !user) return undefined;

  const port = getOptionalNumber(args, "ssh-port");
  assertMatches(host, /^[a-zA-Z0-9_.:-]{1,255}$/, "Invalid --ssh-host value.", "Use hostname/IP characters only.");
  assertMatches(user, /^[a-zA-Z0-9_.-]{1,64}$/, "Invalid --ssh-user value.", "Use username-safe characters only.");

  const connection: VmConnection = {
    host,
    user,
    port,
    privateKeyPath: getOptionalString(args, "ssh-key"),
  };
  if (connection.privateKeyPath) {
    assertMatches(
      connection.privateKeyPath,
      /^[a-zA-Z0-9_./\-~]+$/,
      "Invalid --ssh-key path.",
      "Use a local file path with letters, numbers, dash, underscore, slash, and dot."
    );
  }
  return connection;
}

function parseExportRequest(args: ArgMap): RepositoryExportRequest | undefined {
  const provider = getOptionalString(args, "export-provider");
  const owner = getOptionalString(args, "export-owner");
  const repository = getOptionalString(args, "export-repo");

  if (!provider && (owner || repository)) {
    throw new StratosphereError({
      code: "INPUT_MISSING",
      message: "--export-owner/--export-repo require --export-provider.",
      hint: "Add --export-provider github|gitlab or remove export owner/repo flags.",
    });
  }

  if (!provider) return undefined;

  if (provider !== "github" && provider !== "gitlab") {
    throw new StratosphereError({
      code: "INPUT_INVALID",
      message: `Unsupported export provider: ${provider}`,
      hint: "Use --export-provider github or --export-provider gitlab.",
    });
  }

  if (!owner || !repository) {
    throw new StratosphereError({
      code: "INPUT_MISSING",
      message: "Export provider requires --export-owner and --export-repo.",
      hint: "Provide owner and repository name for export planning.",
      details: { provider },
    });
  }
  assertMatches(
    owner,
    /^[a-zA-Z0-9_.\-/]{1,128}$/,
    "Invalid --export-owner value.",
    "Use letters, numbers, dash, underscore, dot, slash."
  );
  assertMatches(
    repository,
    /^[a-zA-Z0-9_.-]{1,128}$/,
    "Invalid --export-repo value.",
    "Use letters, numbers, dash, underscore, dot."
  );

  const visibility = getOptionalString(args, "export-visibility");
  if (visibility && visibility !== "private" && visibility !== "internal" && visibility !== "public") {
    throw new StratosphereError({
      code: "INPUT_INVALID",
      message: `Invalid export visibility: ${visibility}`,
      hint: "Use one of: private, internal, public.",
    });
  }

  const branchName = getOptionalString(args, "export-branch");
  if (branchName) {
    assertMatches(
      branchName,
      /^[a-zA-Z0-9_./-]{1,255}$/,
      "Invalid --export-branch value.",
      "Use branch-safe characters only."
    );
  }
  const targetBranch = getOptionalString(args, "export-target-branch");
  if (targetBranch) {
    assertMatches(
      targetBranch,
      /^[a-zA-Z0-9_./-]{1,255}$/,
      "Invalid --export-target-branch value.",
      "Use branch-safe characters only."
    );
  }
  const tokenEnv = getOptionalString(args, "export-token-env");
  if (tokenEnv) {
    assertMatches(
      tokenEnv,
      /^[A-Z_][A-Z0-9_]{1,127}$/,
      "Invalid --export-token-env value.",
      "Use uppercase env var format, for example GITHUB_TOKEN."
    );
  }
  const authModeRaw = getOptionalString(args, "export-auth-mode");
  if (authModeRaw && authModeRaw !== "token" && authModeRaw !== "oauth") {
    throw new StratosphereError({
      code: "INPUT_INVALID",
      message: `Invalid --export-auth-mode value: ${authModeRaw}`,
      hint: "Use token or oauth.",
    });
  }
  const apiBaseUrl = getOptionalString(args, "export-api-base-url");
  if (apiBaseUrl) {
    try {
      const parsed = new URL(apiBaseUrl);
      if (parsed.protocol !== "https:") {
        throw new Error("not-https");
      }
    } catch {
      throw new StratosphereError({
        code: "INPUT_INVALID",
        message: "Invalid --export-api-base-url value.",
        hint: "Use a valid HTTPS URL.",
      });
    }
  }
  const webBaseUrl = getOptionalString(args, "export-web-base-url");
  if (webBaseUrl) {
    try {
      const parsed = new URL(webBaseUrl);
      if (parsed.protocol !== "https:") {
        throw new Error("not-https");
      }
    } catch {
      throw new StratosphereError({
        code: "INPUT_INVALID",
        message: "Invalid --export-web-base-url value.",
        hint: "Use a valid HTTPS URL.",
      });
    }
  }

  return {
    provider,
    owner,
    repository,
    visibility: visibility as "private" | "internal" | "public" | undefined,
    branchName,
    targetBranch,
    executionTokenEnvVar: tokenEnv,
    providerApiBaseUrl: apiBaseUrl,
    providerWebBaseUrl: webBaseUrl,
    authMode: authModeRaw === "oauth" ? "oauth" : "token",
    dryRun: getBool(args, "export-execute") ? false : true,
  };
}

function validateSignoffApprovers(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (value < 1) {
    throw new StratosphereError({
      code: "INPUT_INVALID",
      message: "--signoff-required-approvers must be >= 1.",
      hint: "Use 1 or higher.",
      details: { value },
    });
  }
  return value;
}

function resolveDiscoveryMode(args: ArgMap, connection: VmConnection | undefined): DiscoveryMode {
  const localDiscovery = getBool(args, "local-discovery");

  if (localDiscovery && connection) {
    throw new StratosphereError({
      code: "INPUT_CONFLICT",
      message: "--local-discovery cannot be combined with SSH connection flags.",
      hint: "Choose either local discovery or SSH discovery for this run.",
    });
  }

  if (localDiscovery) return "local";
  if (connection) return "ssh";
  return "snapshot";
}

function parseStrategy(args: ArgMap): MigrationStrategy | undefined {
  const strategy = getOptionalString(args, "strategy");
  if (!strategy) return undefined;
  if (strategy === "minimal-change" || strategy === "balanced" || strategy === "aggressive-modernization") {
    return strategy;
  }
  throw new StratosphereError({
    code: "INPUT_INVALID",
    message: `Invalid --strategy value: ${strategy}`,
    hint: "Use one of: minimal-change, balanced, aggressive-modernization.",
  });
}

async function buildRequest(args: ArgMap): Promise<MigrationRunRequest> {
  const connection = parseConnection(args);
  const discoveryMode = resolveDiscoveryMode(args, connection);

  const runtimeFileRaw = getOptionalString(args, "runtime-file");
  const runtimeFile = runtimeFileRaw ? resolve(INVOKE_CWD, runtimeFileRaw) : undefined;
  const runtimeSnapshot = runtimeFile ? loadSnapshot(runtimeFile) : undefined;
  const wizard = getBool(args, "wizard");
  const intakeFileRaw = getOptionalString(args, "intake-file");
  const workspaceFileRaw = getOptionalString(args, "workspace-file");
  if (wizard && (intakeFileRaw || workspaceFileRaw)) {
    throw new StratosphereError({
      code: "INPUT_CONFLICT",
      message: "--wizard cannot be combined with --intake-file or --workspace-file.",
      hint: "Use either the guided wizard or file-based intake/workspace inputs.",
    });
  }
  const intakeFile = intakeFileRaw ? resolve(INVOKE_CWD, intakeFileRaw) : undefined;
  const workspaceFile = workspaceFileRaw ? resolve(INVOKE_CWD, workspaceFileRaw) : undefined;
  const wizardResult = wizard ? await runGuidedIntakeWizard() : undefined;
  const intake = wizardResult?.intake ?? (intakeFile ? validateBusinessIntake(loadJsonFile(intakeFile, "intake")) : undefined);
  const workspace = wizardResult?.workspace
    ?? (workspaceFile ? validateApplicationWorkspace(loadJsonFile(workspaceFile, "workspace")) : undefined);

  if (!runtimeSnapshot && discoveryMode === "snapshot") {
    throw new StratosphereError({
      code: "INPUT_MISSING",
      message: "Snapshot mode requires --runtime-file.",
      hint: "Provide --runtime-file or use --local-discovery / SSH mode.",
    });
  }

  const signoffRequiredApprovers = validateSignoffApprovers(getOptionalNumber(args, "signoff-required-approvers"));

  const defaultMigrationId = runtimeFile
    ? basename(runtimeFile).replace(/\.json$/i, "")
    : discoveryMode === "local"
      ? "local-vm-migration"
      : "live-vm-migration";

  return {
    migrationId: getString(args, "migration-id", defaultMigrationId),
    runtimeSnapshot,
    outDir: resolve(INVOKE_CWD, getString(args, "out-dir", "artifacts/stratosphere")),
    discoveryMode,
    strategy: wizardResult?.strategy ?? parseStrategy(args),
    connection,
    initiatedBy: getOptionalString(args, "initiated-by"),
    signoffRequiredApprovers,
    exportRequest: parseExportRequest(args),
    intake: intake as BusinessIntake | undefined,
    workspace: workspace as ApplicationWorkspace | undefined,
  };
}

function printUsage(): void {
  console.log(`Stratosphere CLI

Usage:
  npm run stratosphere -- --runtime-file fixtures/stratosphere/sample-runtime.json [--out-dir artifacts/stratosphere]
  npm run stratosphere -- --local-discovery [--out-dir artifacts/stratosphere]
  npm run stratosphere -- --ssh-host <host> --ssh-user <user> [--ssh-port <port>] [--out-dir artifacts/stratosphere]

Optional:
  --migration-id <id>
  --strategy <minimal-change|balanced|aggressive-modernization>
  --initiated-by <name>
  --intake-file <path>
  --workspace-file <path>
  --signoff-required-approvers <n>
  --local-discovery
  --wizard
  --ssh-host <host> --ssh-user <user> [--ssh-port <port>] [--ssh-key <path>]
  --export-provider <github|gitlab> --export-owner <owner> --export-repo <repo> [--export-visibility <private|internal|public>] [--export-branch <branch>] [--export-target-branch <branch>] [--export-auth-mode <token|oauth>] [--export-token-env <ENV_VAR>] [--export-api-base-url <url>] [--export-web-base-url <url>] [--export-execute]
  --print-ssh-commands
`);
}

function printError(error: unknown): void {
  const payload = toErrorPayload(error);
  const user = toUserFacingError(error, { operation: "CLI_RUN" });
  console.error("Stratosphere could not complete your request.");
  console.error(`Issue: ${user.title}`);
  console.error(`Code: ${payload.code}`);
  console.error(`What happened: ${user.message}`);
  console.error(`Guidance: ${user.hint}`);
  console.error("Next steps:");
  for (const step of user.nextSteps) {
    console.error(`- ${step}`);
  }
  if (payload.details) {
    console.error(`Details: ${JSON.stringify(sanitizeErrorDetails(payload.details), null, 2)}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (getBool(args, "help")) {
    printUsage();
    return;
  }

  if (getBool(args, "print-ssh-commands")) {
    for (const command of getSshDiscoveryCommandSet()) {
      console.log(command);
    }
    return;
  }

  const request = await buildRequest(args);
  const result = await runMigrationPipeline(request);

  console.log(`Migration package generated at ${request.outDir}`);
  console.log(summarizeRun(result));
  console.log("reports/executive-summary.md generated for non-technical stakeholder review.");

  if (result.exportResult) {
    console.log(
      `repositoryExport provider=${result.exportResult.provider} dryRun=${result.exportResult.dryRun} actions=${result.exportResult.actions.length}`
    );
  }
}

main().catch((error: unknown) => {
  printError(error);
  printUsage();
  process.exit(1);
});
