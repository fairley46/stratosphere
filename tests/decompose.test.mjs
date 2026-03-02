import assert from "node:assert/strict";
import test from "node:test";
import { decomposeRuntime } from "../packages/engine/dist/decompose.js";

function buildDiscovery(processes, scheduledJobs = []) {
  return {
    runtime: {
      host: { hostname: "vm-a", os: "linux", distro: "RHEL 9", ip: "10.0.0.1" },
      processes,
      connections: [],
      scheduledJobs,
      source: { detectedStacks: ["unknown"], buildFiles: [] },
    },
    evidence: {
      collector: "snapshot",
      commands: [],
      warnings: [],
      collectedAt: new Date().toISOString(),
      commandResults: [],
    },
  };
}

test("decomposeRuntime classifies CronJob and StatefulSet correctly", () => {
  const discovery = buildDiscovery(
    [
      {
        pid: 100,
        name: "billing-api",
        command: "java -jar billing.jar",
        user: "app",
        cpuPercent: 20,
        memoryMb: 512,
        listeningPorts: [8080],
        fileWrites: [],
        envHints: {},
      },
      {
        pid: 101,
        name: "invoice-worker",
        command: "dotnet InvoiceWorker.dll",
        user: "app",
        cpuPercent: 10,
        memoryMb: 256,
        listeningPorts: [],
        fileWrites: ["/var/lib/invoice-worker/state.db"],
        envHints: {},
      },
      {
        pid: 102,
        name: "cleanup-job",
        command: "node cleanup.js",
        user: "app",
        cpuPercent: 2,
        memoryMb: 128,
        listeningPorts: [],
        fileWrites: [],
        envHints: {},
      },
    ],
    [
      {
        name: "cleanup-nightly",
        schedule: "0 2 * * *",
        command: "node cleanup.js",
        source: "cron",
      },
    ]
  );

  const result = decomposeRuntime(discovery);
  const byName = new Map(result.recommendations.map((item) => [item.componentName, item]));

  assert.equal(byName.get("cleanup-job")?.kind, "CronJob");
  assert.equal(byName.get("invoice-worker")?.kind, "StatefulSet");
  assert.equal(byName.get("billing-api")?.kind, "Deployment");
  assert.equal(byName.get("billing-api")?.stack, "java-spring");
  assert.equal(byName.get("invoice-worker")?.stack, "dotnet");
});
