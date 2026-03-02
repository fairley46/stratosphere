import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  __orchestratorTestables,
  previewDecomposition,
  runMigrationPipeline,
  toErrorPayload,
} from "../packages/engine/dist/index.js";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/stratosphere/sample-runtime.json", import.meta.url), "utf8")
);

test("orchestrator internals hash inputs and pick adapters defensively", () => {
  const hashA = __orchestratorTestables.hashInput("mig", fixture, "snapshot");
  const hashB = __orchestratorTestables.hashInput("mig", undefined, "local");
  assert.notEqual(hashA, hashB);

  const pickedSsh = __orchestratorTestables.pickAdapter({
    migrationId: "m1",
    mode: "weird",
    connection: { host: "x", user: "y" },
  });
  const pickedSnapshot = __orchestratorTestables.pickAdapter({
    migrationId: "m2",
    mode: "weird",
  });
  assert.equal(pickedSsh.name, "ssh-readonly");
  assert.equal(pickedSnapshot.name, "snapshot");
  assert.equal(__orchestratorTestables.pickAdapter({ migrationId: "m3", mode: "local" }).name, "local-readonly");
  assert.equal(__orchestratorTestables.pickAdapter({ migrationId: "m4", mode: "ssh" }).name, "ssh-readonly");
  assert.equal(__orchestratorTestables.pickAdapter({ migrationId: "m5", mode: "snapshot" }).name, "snapshot");

  const signoff = __orchestratorTestables.buildSignoffCheckpoint({
    migrationId: "m3",
    outDir: "/tmp/x",
    runtimeSnapshot: fixture,
    signoffRequiredApprovers: 0,
  });
  assert.equal(signoff.requiredApprovers, 1);
});

test("previewDecomposition returns graph and recommendations", () => {
  const preview = previewDecomposition("preview-migration", fixture);
  assert.ok(preview.graph.nodes.length > 0);
  assert.ok(preview.decomposition.recommendations.length > 0);
});

test("runMigrationPipeline defaults initiatedBy and supports undefined discoveryMode", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "strat-orch-"));
  const result = await runMigrationPipeline({
    migrationId: "orchestrator-defaults",
    runtimeSnapshot: fixture,
    outDir,
    discoveryMode: undefined,
  });
  assert.equal(result.audit.initiatedBy, "unknown");
  assert.equal(result.signoffCheckpoint.requiredApprovers, 1);
  rmSync(outDir, { recursive: true, force: true });
});

test("runMigrationPipeline marks vendor-owned workloads as advisory-only blockers", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "strat-orch-vendor-"));
  const result = await runMigrationPipeline({
    migrationId: "orchestrator-vendor",
    runtimeSnapshot: fixture,
    outDir,
    intake: {
      applicationName: "Vendor ERP",
      businessOwner: "Operations",
      criticality: "high",
      downtimeTolerance: "limited",
      complianceNeeds: [],
      vendorOwned: true,
      approvalContacts: ["ops@acme.com"],
    },
  });

  assert.ok(result.decomposition.blockers.some((item) => item.includes("Vendor-owned application detected")));
  rmSync(outDir, { recursive: true, force: true });
});

test("runMigrationPipeline rejects snapshot mode without runtime", async () => {
  await assert.rejects(
    () =>
      runMigrationPipeline({
        migrationId: "orchestrator-invalid",
        outDir: "/tmp/orchestrator-invalid",
        discoveryMode: "snapshot",
      }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_MISSING");
      return true;
    }
  );
});
