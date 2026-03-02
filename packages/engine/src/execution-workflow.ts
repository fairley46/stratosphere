import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { StratosphereError } from "./errors.js";
import type {
  ExecutionApproval,
  ExecutionFeedback,
  ExecutionJob,
  ExecutionStep,
  ExportExecutionStatus,
  PreflightCheck,
  ReviewDecision,
} from "./types.js";

const EXECUTION_REPORT_PATH = "reports/execution-job.json";
const EXECUTION_APPROVER_FLOOR = 2;

function nowIso(): string {
  return new Date().toISOString();
}

function assertAllowedState(job: ExecutionJob, allowed: ExecutionJob["state"][], action: string): void {
  if (!allowed.includes(job.state)) {
    throw new StratosphereError({
      code: "INPUT_CONFLICT",
      message: `Cannot ${action} while job is in state ${job.state}.`,
      hint: `Allowed states: ${allowed.join(", ")}`,
      details: { state: job.state, action },
    });
  }
}

function ensureBundleDir(bundleDir: string): void {
  if (!existsSync(bundleDir)) {
    throw new StratosphereError({
      code: "INPUT_INVALID",
      message: `Bundle directory does not exist: ${bundleDir}`,
      hint: "Generate artifacts first, then initialize execution workflow.",
    });
  }
}

export function executionJobPath(bundleDir: string): string {
  return join(bundleDir, EXECUTION_REPORT_PATH);
}

export function saveExecutionJob(job: ExecutionJob): void {
  const filePath = executionJobPath(job.bundleDir);
  mkdirSync(join(job.bundleDir, "reports"), { recursive: true });
  writeFileSync(filePath, JSON.stringify(job, null, 2), "utf8");
}

export function loadExecutionJob(bundleDir: string): ExecutionJob {
  const filePath = executionJobPath(bundleDir);
  if (!existsSync(filePath)) {
    throw new StratosphereError({
      code: "FILE_READ_FAILED",
      message: `Execution workflow file not found: ${filePath}`,
      hint: "Initialize execution workflow first.",
    });
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as ExecutionJob;
  } catch (error) {
    throw new StratosphereError({
      code: "JSON_PARSE_FAILED",
      message: `Invalid execution workflow JSON: ${filePath}`,
      hint: "Regenerate workflow file from migration bundle.",
      details: { reason: String(error) },
    });
  }
}

function baseExecutionSteps(): ExecutionStep[] {
  return [
    { id: "prepare-green", title: "Prepare green namespace and baseline config", status: "pending" },
    { id: "deploy-green", title: "Deploy generated manifests to green", status: "pending" },
    { id: "validate-green", title: "Run health and dependency checks", status: "pending" },
    { id: "shift-traffic-5", title: "Shift 5% traffic", status: "pending" },
    { id: "shift-traffic-25", title: "Shift 25% traffic", status: "pending" },
    { id: "shift-traffic-50", title: "Shift 50% traffic", status: "pending" },
    { id: "shift-traffic-100", title: "Shift 100% traffic", status: "pending" },
    { id: "stabilize", title: "Observe stabilization window", status: "pending" },
  ];
}

function defaultExportExecution(): ExportExecutionStatus {
  return {
    requested: false,
    executed: false,
    message: "Planning-only mode. Export execution requires explicit policy enablement.",
  };
}

export function initExecutionWorkflow(input: {
  migrationId: string;
  bundleDir: string;
  targetEnvironment: string;
  requiredApprovers?: number;
  kubeconfig?: string;
  kubeContext?: string;
  kubeNamespace?: string;
}): ExecutionJob {
  ensureBundleDir(input.bundleDir);
  const requiredApprovers = Math.max(EXECUTION_APPROVER_FLOOR, input.requiredApprovers ?? EXECUTION_APPROVER_FLOOR);
  const job: ExecutionJob = {
    jobId: randomUUID(),
    migrationId: input.migrationId,
    bundleDir: input.bundleDir,
    targetPlatform: "kubernetes",
    targetEnvironment: input.targetEnvironment,
    state: "REVIEW_REQUIRED",
    requiredApprovers,
    reviewFeedback: [],
    approvals: [],
    preflightChecks: [],
    executionSteps: baseExecutionSteps(),
    exportExecution: defaultExportExecution(),
    revisionCount: 0,
    lastUpdatedAt: nowIso(),
    ...(input.kubeconfig !== undefined && { kubeconfig: input.kubeconfig }),
    ...(input.kubeContext !== undefined && { kubeContext: input.kubeContext }),
    ...(input.kubeNamespace !== undefined && { kubeNamespace: input.kubeNamespace }),
  };
  saveExecutionJob(job);
  return job;
}

export function submitExecutionReview(input: {
  bundleDir: string;
  by: string;
  decision: ReviewDecision;
  notes: string;
}): ExecutionJob {
  const job = loadExecutionJob(input.bundleDir);
  assertAllowedState(job, ["REVIEW_REQUIRED", "REVISION_REQUIRED"], "submit review");

  const feedback: ExecutionFeedback = {
    by: input.by,
    at: nowIso(),
    decision: input.decision,
    notes: input.notes.trim(),
  };
  job.reviewFeedback.push(feedback);

  if (input.decision === "accept") {
    job.state = "APPROVAL_PENDING";
  } else {
    job.state = "REVISION_REQUIRED";
    job.revisionCount += 1;
  }

  job.lastUpdatedAt = nowIso();
  saveExecutionJob(job);
  return job;
}

export function registerExecutionApproval(input: { bundleDir: string; by: string }): ExecutionJob {
  const job = loadExecutionJob(input.bundleDir);
  assertAllowedState(job, ["APPROVAL_PENDING"], "register approval");

  const alreadyApproved = job.approvals.some((item) => item.by === input.by);
  if (!alreadyApproved) {
    const approval: ExecutionApproval = { by: input.by, at: nowIso() };
    job.approvals.push(approval);
  }

  job.lastUpdatedAt = nowIso();
  saveExecutionJob(job);
  return job;
}

function readReadinessScore(bundleDir: string): number | undefined {
  const filePath = join(bundleDir, "reports/readiness.json");
  if (!existsSync(filePath)) return undefined;
  try {
    const payload = JSON.parse(readFileSync(filePath, "utf8")) as { score?: number };
    if (typeof payload.score === "number") return payload.score;
    return undefined;
  } catch {
    return undefined;
  }
}

export function runExecutionPreflight(input: {
  bundleDir: string;
  requireExportExecution?: boolean;
}): ExecutionJob {
  const job = loadExecutionJob(input.bundleDir);
  assertAllowedState(job, ["APPROVAL_PENDING"], "run preflight");

  job.state = "PREFLIGHT_RUNNING";
  const checks: PreflightCheck[] = [];

  const approvalsReady = job.approvals.length >= job.requiredApprovers;
  checks.push({
    id: "approvals",
    title: "Required approvals",
    passed: approvalsReady,
    message: approvalsReady
      ? `Approval threshold met (${job.approvals.length}/${job.requiredApprovers}).`
      : `Approvals pending (${job.approvals.length}/${job.requiredApprovers}).`,
  });

  const readiness = readReadinessScore(job.bundleDir);
  const readinessReady = readiness !== undefined && readiness >= 70;
  checks.push({
    id: "readiness-score",
    title: "Readiness score threshold",
    passed: readinessReady,
    message:
      readiness !== undefined
        ? `Readiness score is ${readiness} (threshold 70).`
        : "Readiness report missing. Run migration pipeline with decision reports first.",
  });

  const reportsExists = existsSync(join(job.bundleDir, "reports/migration-summary.json"));
  checks.push({
    id: "bundle-evidence",
    title: "Bundle evidence present",
    passed: reportsExists,
    message: reportsExists ? "Migration summary report found." : "Missing reports/migration-summary.json.",
  });

  const exportPolicyOk = input.requireExportExecution ? process.env.STRATOSPHERE_ENABLE_EXPORT_EXECUTION === "true" : true;
  checks.push({
    id: "export-policy",
    title: "Export execution policy",
    passed: exportPolicyOk,
    message: exportPolicyOk
      ? "Export policy check passed."
      : "Export execution policy disabled. Set STRATOSPHERE_ENABLE_EXPORT_EXECUTION=true when policy is approved.",
  });

  // Kubernetes cluster validation: skip with advisory warn when no kubeconfig is set.
  if (!job.kubeconfig) {
    checks.push({
      id: "k8s-connectivity",
      title: "Kubernetes cluster validation",
      passed: true,
      message: "Cluster validation skipped — no kubeconfig configured on execution job. Set kubeconfig when initializing the workflow to enable live cluster checks.",
    });
  } else {
    const clusterChecksPath = join(job.bundleDir, "reports/cluster-preflight.json");
    if (existsSync(clusterChecksPath)) {
      try {
        const cached = JSON.parse(readFileSync(clusterChecksPath, "utf8")) as PreflightCheck[];
        checks.push(...cached);
      } catch {
        checks.push({
          id: "k8s-cluster",
          title: "Kubernetes cluster validation",
          passed: false,
          message: "Failed to read cached cluster preflight results from reports/cluster-preflight.json.",
        });
      }
    } else {
      checks.push({
        id: "k8s-cluster",
        title: "Kubernetes cluster validation",
        passed: true,
        message: "Kubeconfig is set. Run runClusterPreflightChecks() and write results to reports/cluster-preflight.json for live cluster validation.",
      });
    }
  }

  job.preflightChecks = checks;
  const allPassed = checks.every((check) => check.passed);
  job.state = allPassed ? "EXECUTION_READY" : "FAILED";
  job.lastUpdatedAt = nowIso();
  saveExecutionJob(job);
  return job;
}

function markStepRunning(step: ExecutionStep): void {
  step.status = "running";
  step.startedAt = nowIso();
}

function markStepCompleted(step: ExecutionStep): void {
  step.status = "completed";
  step.completedAt = nowIso();
}

export function startExecution(input: {
  bundleDir: string;
  pauseAfterStepId?: string;
}): ExecutionJob {
  const job = loadExecutionJob(input.bundleDir);
  assertAllowedState(job, ["EXECUTION_READY", "PAUSED_FOR_REVIEW"], "start execution");

  job.state = "EXECUTING";
  for (const step of job.executionSteps) {
    if (step.status === "completed") continue;
    markStepRunning(step);
    if (input.pauseAfterStepId && step.id === input.pauseAfterStepId) {
      step.status = "paused";
      step.details = "Paused for human checkpoint review.";
      job.state = "PAUSED_FOR_REVIEW";
      job.lastUpdatedAt = nowIso();
      saveExecutionJob(job);
      return job;
    }
    markStepCompleted(step);
  }

  job.state = "COMPLETED";
  job.lastUpdatedAt = nowIso();
  saveExecutionJob(job);
  return job;
}

export function pauseExecution(input: { bundleDir: string; reason: string }): ExecutionJob {
  const job = loadExecutionJob(input.bundleDir);
  assertAllowedState(job, ["EXECUTING"], "pause execution");

  const runningStep = job.executionSteps.find((step) => step.status === "running");
  if (runningStep) {
    runningStep.status = "paused";
    runningStep.details = input.reason.trim();
  }

  job.state = "PAUSED_FOR_REVIEW";
  job.lastUpdatedAt = nowIso();
  saveExecutionJob(job);
  return job;
}

export function triggerRollback(input: { bundleDir: string; reason: string }): ExecutionJob {
  const job = loadExecutionJob(input.bundleDir);
  assertAllowedState(job, ["EXECUTING", "PAUSED_FOR_REVIEW", "FAILED"], "trigger rollback");

  job.state = "ROLLBACK_RUNNING";
  const rollbackStep: ExecutionStep = {
    id: "rollback",
    title: "Restore traffic to blue and freeze green changes",
    status: "running",
    startedAt: nowIso(),
    details: input.reason.trim(),
  };
  job.executionSteps.push(rollbackStep);
  markStepCompleted(rollbackStep);
  job.state = "FAILED";
  job.lastUpdatedAt = nowIso();
  saveExecutionJob(job);
  return job;
}
