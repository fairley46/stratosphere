import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runMigrationPipeline } from "../packages/engine/dist/orchestrator.js";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/stratosphere/sample-runtime.json", import.meta.url), "utf8")
);

test("runMigrationPipeline writes core reports and export plan", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "stratosphere-out-"));

  const result = await runMigrationPipeline({
    migrationId: "integration-test",
    runtimeSnapshot: fixture,
    outDir,
    initiatedBy: "test-runner",
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
  assert.ok(currentMap.includes("Current-State Application Map"));
  assert.ok(futureMap.includes("Future-State Application Map"));

  rmSync(outDir, { recursive: true, force: true });
});
