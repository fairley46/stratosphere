import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  diffPlanRevisions,
  initExecutionWorkflow,
  loadExecutionJob,
  pauseExecution,
  registerExecutionApproval,
  runExecutionPreflight,
  startExecution,
  submitExecutionReview,
  toErrorPayload,
  triggerRollback,
} from "../packages/engine/dist/index.js";

function prepBundleDir(label = "strat-exec-") {
  const dir = mkdtempSync(join(tmpdir(), label));
  mkdirSync(join(dir, "reports"), { recursive: true });
  writeFileSync(
    join(dir, "reports/migration-summary.json"),
    JSON.stringify({ workloadCount: 3, blockers: [], validation: { findings: [] }, strategy: "balanced" }, null, 2),
    "utf8"
  );
  writeFileSync(join(dir, "reports/readiness.json"), JSON.stringify({ score: 88 }, null, 2), "utf8");
  return dir;
}

test("execution workflow lifecycle: init -> review -> approve -> preflight -> execute", () => {
  const bundleDir = prepBundleDir();

  const init = initExecutionWorkflow({
    migrationId: "mig-a",
    bundleDir,
    targetEnvironment: "stage-us-central1",
    requiredApprovers: 1,
  });
  assert.equal(init.requiredApprovers, 2);
  assert.equal(init.state, "REVIEW_REQUIRED");

  const reviewed = submitExecutionReview({
    bundleDir,
    by: "reviewer-a",
    decision: "accept",
    notes: "Looks good.",
  });
  assert.equal(reviewed.state, "APPROVAL_PENDING");

  const approvedOnce = registerExecutionApproval({ bundleDir, by: "approver-1" });
  assert.equal(approvedOnce.approvals.length, 1);
  const approvedTwice = registerExecutionApproval({ bundleDir, by: "approver-2" });
  assert.equal(approvedTwice.approvals.length, 2);

  const preflight = runExecutionPreflight({ bundleDir });
  assert.equal(preflight.state, "EXECUTION_READY");
  assert.ok(preflight.preflightChecks.every((item) => item.passed));

  const executed = startExecution({ bundleDir });
  assert.equal(executed.state, "COMPLETED");
  assert.ok(executed.executionSteps.every((step) => step.status === "completed"));

  const loaded = loadExecutionJob(bundleDir);
  assert.equal(loaded.state, "COMPLETED");

  rmSync(bundleDir, { recursive: true, force: true });
});

test("execution workflow handles revision requests and preflight failures", () => {
  const bundleDir = prepBundleDir("strat-exec-fail-");
  writeFileSync(join(bundleDir, "reports/readiness.json"), JSON.stringify({ score: 40 }, null, 2), "utf8");

  initExecutionWorkflow({
    migrationId: "mig-b",
    bundleDir,
    targetEnvironment: "prod-us-central1",
  });
  const review = submitExecutionReview({
    bundleDir,
    by: "reviewer-b",
    decision: "request_changes",
    notes: "Need vendor check.",
  });
  assert.equal(review.state, "REVISION_REQUIRED");
  assert.equal(review.revisionCount, 1);

  // Move to approval path after another accept review.
  submitExecutionReview({
    bundleDir,
    by: "reviewer-c",
    decision: "accept",
    notes: "Updated and accepted.",
  });
  registerExecutionApproval({ bundleDir, by: "approver-1" });
  registerExecutionApproval({ bundleDir, by: "approver-2" });
  const preflight = runExecutionPreflight({ bundleDir, requireExportExecution: true });
  assert.equal(preflight.state, "FAILED");
  assert.ok(preflight.preflightChecks.some((check) => !check.passed));

  rmSync(bundleDir, { recursive: true, force: true });
});

test("execution workflow supports pause and rollback controls", () => {
  const bundleDir = prepBundleDir("strat-exec-pause-");
  initExecutionWorkflow({
    migrationId: "mig-c",
    bundleDir,
    targetEnvironment: "stage-eu-west1",
  });
  submitExecutionReview({ bundleDir, by: "reviewer", decision: "accept", notes: "ok" });
  registerExecutionApproval({ bundleDir, by: "approver-1" });
  registerExecutionApproval({ bundleDir, by: "approver-2" });
  runExecutionPreflight({ bundleDir });

  const pausedByStep = startExecution({ bundleDir, pauseAfterStepId: "shift-traffic-25" });
  assert.equal(pausedByStep.state, "PAUSED_FOR_REVIEW");

  const resumed = startExecution({ bundleDir });
  assert.equal(resumed.state, "COMPLETED");

  // Trigger rollback from failed state path.
  resumed.state = "FAILED";
  writeFileSync(join(bundleDir, "reports/execution-job.json"), JSON.stringify(resumed, null, 2), "utf8");
  const rolledBack = triggerRollback({ bundleDir, reason: "Manual rollback drill" });
  assert.equal(rolledBack.state, "FAILED");
  assert.ok(rolledBack.executionSteps.some((step) => step.id === "rollback"));

  rmSync(bundleDir, { recursive: true, force: true });
});

test("execution workflow rejects invalid transitions", () => {
  const bundleDir = prepBundleDir("strat-exec-invalid-");
  initExecutionWorkflow({
    migrationId: "mig-d",
    bundleDir,
    targetEnvironment: "stage",
  });

  assert.throws(
    () => registerExecutionApproval({ bundleDir, by: "approver-x" }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_CONFLICT");
      return true;
    }
  );

  assert.throws(
    () => pauseExecution({ bundleDir, reason: "not executing yet" }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_CONFLICT");
      return true;
    }
  );

  rmSync(bundleDir, { recursive: true, force: true });
});

test("execution workflow handles missing bundle and workflow file errors", () => {
  const missingBundle = join(tmpdir(), `strat-missing-bundle-${Date.now()}`);

  assert.throws(
    () =>
      initExecutionWorkflow({
        migrationId: "missing",
        bundleDir: missingBundle,
        targetEnvironment: "stage",
      }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_INVALID");
      return true;
    }
  );

  const existingBundle = prepBundleDir("strat-missing-job-");
  rmSync(join(existingBundle, "reports/execution-job.json"), { force: true });
  assert.throws(
    () => loadExecutionJob(existingBundle),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "FILE_READ_FAILED");
      return true;
    }
  );

  writeFileSync(join(existingBundle, "reports/execution-job.json"), "{not-json", "utf8");
  assert.throws(
    () => loadExecutionJob(existingBundle),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "JSON_PARSE_FAILED");
      return true;
    }
  );

  rmSync(existingBundle, { recursive: true, force: true });
});

test("execution workflow handles readiness parse edge cases and pause running step", () => {
  const bundleDir = prepBundleDir("strat-exec-edge-");
  initExecutionWorkflow({
    migrationId: "mig-edge",
    bundleDir,
    targetEnvironment: "stage-us",
  });
  submitExecutionReview({ bundleDir, by: "reviewer", decision: "accept", notes: "ok" });
  registerExecutionApproval({ bundleDir, by: "approver-1" });
  registerExecutionApproval({ bundleDir, by: "approver-2" });

  writeFileSync(join(bundleDir, "reports/readiness.json"), JSON.stringify({ score: "88" }, null, 2), "utf8");
  const nonNumericReadiness = runExecutionPreflight({ bundleDir });
  assert.equal(nonNumericReadiness.state, "FAILED");
  assert.ok(nonNumericReadiness.preflightChecks.some((check) => check.id === "readiness-score" && !check.passed));

  // Verify malformed readiness JSON is also handled defensively.
  const malformedBundleDir = prepBundleDir("strat-exec-edge-malformed-");
  initExecutionWorkflow({
    migrationId: "mig-edge-malformed",
    bundleDir: malformedBundleDir,
    targetEnvironment: "stage-us",
  });
  submitExecutionReview({ bundleDir: malformedBundleDir, by: "reviewer", decision: "accept", notes: "ok" });
  registerExecutionApproval({ bundleDir: malformedBundleDir, by: "approver-1" });
  registerExecutionApproval({ bundleDir: malformedBundleDir, by: "approver-2" });
  writeFileSync(join(malformedBundleDir, "reports/readiness.json"), "{malformed", "utf8");
  const malformedReadiness = runExecutionPreflight({ bundleDir: malformedBundleDir });
  assert.equal(malformedReadiness.state, "FAILED");

  // Force EXECUTING with one running step to cover pause path behavior.
  malformedReadiness.state = "EXECUTING";
  malformedReadiness.executionSteps[0].status = "running";
  writeFileSync(join(malformedBundleDir, "reports/execution-job.json"), JSON.stringify(malformedReadiness, null, 2), "utf8");
  const paused = pauseExecution({ bundleDir: malformedBundleDir, reason: "Manual checkpoint" });
  assert.equal(paused.state, "PAUSED_FOR_REVIEW");
  assert.equal(paused.executionSteps[0].status, "paused");
  assert.equal(paused.executionSteps[0].details, "Manual checkpoint");

  rmSync(bundleDir, { recursive: true, force: true });
  rmSync(malformedBundleDir, { recursive: true, force: true });
});

test("revision diff highlights migration summary changes", () => {
  const older = prepBundleDir("strat-rev-old-");
  const newer = prepBundleDir("strat-rev-new-");
  writeFileSync(
    join(newer, "reports/migration-summary.json"),
    JSON.stringify(
      {
        workloadCount: 4,
        blockers: ["vendor advisory"],
        validation: { findings: [{ severity: "high", message: "x" }] },
        strategy: "minimal-change",
      },
      null,
      2
    ),
    "utf8"
  );

  const diff = diffPlanRevisions(older, newer);
  assert.ok(diff.changes.length > 0);
  assert.ok(diff.changes.some((item) => item.path === "workloadCount"));
  assert.ok(diff.changes.some((item) => item.path === "strategy"));

  rmSync(older, { recursive: true, force: true });
  rmSync(newer, { recursive: true, force: true });
});

test("revision diff handles invalid JSON inputs defensively", () => {
  const older = prepBundleDir("strat-rev-invalid-old-");
  const newer = prepBundleDir("strat-rev-invalid-new-");
  writeFileSync(join(older, "reports/migration-summary.json"), "{invalid", "utf8");

  const diff = diffPlanRevisions(older, newer);
  assert.ok(diff.changes.length > 0);

  rmSync(older, { recursive: true, force: true });
  rmSync(newer, { recursive: true, force: true });
});
