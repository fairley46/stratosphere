import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runMigrationPipeline } from "../packages/engine/dist/orchestrator.js";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/stratosphere/sample-runtime.json", import.meta.url), "utf8")
);
const intakeFixture = JSON.parse(
  readFileSync(new URL("../fixtures/stratosphere/sample-intake.json", import.meta.url), "utf8")
);
const workspaceFixture = JSON.parse(
  readFileSync(new URL("../fixtures/stratosphere/sample-workspace.json", import.meta.url), "utf8")
);

test("runMigrationPipeline writes core reports and export plan", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "stratosphere-out-"));

  const result = await runMigrationPipeline({
    migrationId: "integration-test",
    runtimeSnapshot: fixture,
    outDir,
    strategy: "balanced",
    initiatedBy: "test-runner",
    intake: intakeFixture,
    workspace: workspaceFixture,
    exportRequest: {
      provider: "github",
      owner: "acme",
      repository: "migration-artifacts",
      dryRun: true,
    },
  });

  assert.equal(result.validation.requiresHumanSignoff, true);
  assert.equal(result.signoffCheckpoint.approvalState, "PENDING");

  const summary = JSON.parse(readFileSync(join(outDir, "reports/migration-summary.json"), "utf8"));
  assert.equal(summary.audit.initiatedBy, "test-runner");
  assert.ok(summary.applicationMaps.currentStateSummary);
  assert.ok(summary.applicationMaps.futureStateSummary);

  const exportReport = JSON.parse(readFileSync(join(outDir, "reports/repository-export.json"), "utf8"));
  assert.equal(exportReport.provider, "github");
  assert.equal(exportReport.dryRun, true);

  const currentMap = readFileSync(join(outDir, "reports/application-map-current.md"), "utf8");
  const futureMap = readFileSync(join(outDir, "reports/application-map-future.md"), "utf8");
  const executiveSummary = readFileSync(join(outDir, "reports/executive-summary.md"), "utf8");
  const executivePack = JSON.parse(readFileSync(join(outDir, "reports/executive-pack.json"), "utf8"));
  const readiness = JSON.parse(readFileSync(join(outDir, "reports/readiness.json"), "utf8"));
  const roiEstimate = JSON.parse(readFileSync(join(outDir, "reports/roi-estimate.json"), "utf8"));
  const strategyOptions = JSON.parse(readFileSync(join(outDir, "reports/migration-options.json"), "utf8"));
  const runtimeProfileSummary = JSON.parse(readFileSync(join(outDir, "reports/runtime-profile-summary.json"), "utf8"));
  const sourceAnalysis = JSON.parse(readFileSync(join(outDir, "reports/source-analysis.json"), "utf8"));
  const workspaceReport = JSON.parse(readFileSync(join(outDir, "reports/workspace.json"), "utf8"));
  assert.ok(currentMap.includes("Current-State Application Map"));
  assert.ok(futureMap.includes("Future-State Application Map"));
  assert.ok(executiveSummary.includes("Executive Summary"));
  assert.ok(executiveSummary.includes("Billing Platform"));
  assert.equal(executivePack.strategy, "balanced");
  assert.ok(readiness.score >= 0);
  assert.ok(roiEstimate.projections.currentMonthlyUsd >= roiEstimate.projections.projectedMonthlyUsd);
  assert.ok(Array.isArray(strategyOptions.options));
  assert.ok(runtimeProfileSummary.processCount > 0);
  assert.ok(Array.isArray(sourceAnalysis.componentMappings));
  assert.equal(workspaceReport.workspaceName, "billing-app");

  rmSync(outDir, { recursive: true, force: true });
});
