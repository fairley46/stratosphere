import assert from "node:assert/strict";
import test from "node:test";
import { decomposeRuntime } from "../packages/engine/dist/decompose.js";

function proc({
  pid,
  name,
  command,
  cpuPercent = 1,
  memoryMb = 64,
  listeningPorts = [],
  fileWrites = [],
}) {
  return {
    pid,
    name,
    command,
    user: "app",
    cpuPercent,
    memoryMb,
    listeningPorts,
    fileWrites,
    envHints: {},
  };
}

test("decomposeRuntime covers stack fallback, unknown stack, and blocker conditions", () => {
  const discovery = {
    runtime: {
      host: { hostname: "vm", os: "linux", distro: "Rocky 9", ip: "10.0.0.2" },
      processes: [
        proc({
          pid: 1,
          name: "night-worker",
          command: "/opt/acme/bin/runner",
          fileWrites: ["/var/lib/acme/state.db"],
          cpuPercent: 40,
          memoryMb: 512,
        }),
        proc({
          pid: 2,
          name: "fallback-stack",
          command: "/opt/acme/custom",
          cpuPercent: 2,
          memoryMb: 80,
        }),
        proc({
          pid: 22,
          name: "fallback-stack",
          command: "/opt/acme/custom --replica",
          cpuPercent: 4,
          memoryMb: 96,
        }),
        proc({
          pid: 3,
          name: "unknown-stack",
          command: "/opt/acme/other",
          listeningPorts: [8080],
        }),
      ],
      connections: [
        { processName: "unknown-stack", toHost: "db.internal", toPort: 5432, protocol: "tcp" },
        { processName: "unknown-stack", toHost: "db.internal", toPort: 5432, protocol: "tcp" },
      ],
      scheduledJobs: [{ name: "nightly", schedule: "0 1 * * *", command: "/bin/sh -lc night worker", source: "cron" }],
      source: {
        detectedStacks: ["python"],
        buildFiles: [],
      },
    },
    evidence: {
      collector: "snapshot",
      commands: [],
      warnings: [],
      collectedAt: new Date().toISOString(),
      commandResults: [],
    },
  };

  const result = decomposeRuntime(discovery);
  const byName = new Map(result.recommendations.map((item) => [item.componentName, item]));

  assert.equal(byName.get("night-worker").kind, "CronJob");
  assert.equal(byName.get("night-worker").stack, "python");
  assert.equal(byName.get("night-worker").schedule, "0 1 * * *");
  assert.ok(result.blockers.some((item) => item.includes("both persistent writes and scheduled execution")));

  assert.equal(byName.get("fallback-stack").stack, "python");
  assert.equal(byName.get("fallback-stack").kind, "Deployment");

  assert.equal(byName.get("unknown-stack").stack, "python");
  assert.deepEqual(byName.get("unknown-stack").dependencies, ["db.internal:5432"]);
});

test("decomposeRuntime uses unknown stack fallback and resource minimums", () => {
  const discovery = {
    runtime: {
      host: { hostname: "vm", os: "linux", distro: "RHEL", ip: "10.0.0.3" },
      processes: [proc({ pid: 11, name: "tiny", command: "bin/tiny", cpuPercent: 0, memoryMb: 1 })],
      connections: [],
      scheduledJobs: [],
      source: {
        detectedStacks: ["unknown"],
        buildFiles: [],
      },
    },
    evidence: {
      collector: "snapshot",
      commands: [],
      warnings: [],
      collectedAt: new Date().toISOString(),
      commandResults: [],
    },
  };

  const result = decomposeRuntime(discovery);
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].stack, "unknown");
  assert.equal(result.recommendations[0].resourceRecommendation.cpuRequestMillicores, 100);
  assert.equal(result.recommendations[0].resourceRecommendation.memoryRequestMb, 128);
});
