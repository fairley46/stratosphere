import assert from "node:assert/strict";
import test from "node:test";
import { buildVmDnaGraph } from "../packages/engine/dist/graph.js";

test("buildVmDnaGraph creates nodes and edges for core runtime entities", () => {
  const discovery = {
    runtime: {
      host: { hostname: "vm-b", os: "linux", distro: "Rocky", ip: "10.0.0.2" },
      processes: [
        {
          pid: 200,
          name: "api",
          command: "node index.js",
          user: "app",
          cpuPercent: 8,
          memoryMb: 256,
          listeningPorts: [3000],
          fileWrites: ["/var/log/api.log"],
          envHints: {},
        },
      ],
      connections: [
        {
          processName: "api",
          toHost: "postgres.internal",
          toPort: 5432,
          protocol: "tcp",
        },
      ],
      scheduledJobs: [],
      source: {
        repositoryPath: "git@github.com:acme/api.git",
        detectedStacks: ["nodejs"],
        buildFiles: ["package.json"],
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

  const graph = buildVmDnaGraph("mig-1", discovery);

  assert.ok(graph.nodes.find((node) => node.type === "host"));
  assert.ok(graph.nodes.find((node) => node.type === "process"));
  assert.ok(graph.nodes.find((node) => node.type === "external-service"));
  assert.ok(graph.nodes.find((node) => node.type === "source-repo"));
  assert.ok(graph.edges.find((edge) => edge.type === "calls"));
});
