import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildVmDnaGraph } from "../packages/engine/dist/graph.js";
import { generateArtifacts } from "../packages/engine/dist/generate.js";
import { buildApplicationMaps } from "../packages/engine/dist/maps.js";
import { exportBundle, summarizeRun } from "../packages/engine/dist/export.js";

function rec({
  id,
  name,
  kind,
  stack,
  ports = [],
  schedule,
  confidence = 0.9,
  dependencies = [],
}) {
  return {
    componentId: id,
    componentName: name,
    kind,
    stack,
    confidence,
    rationale: ["test"],
    imageTag: `${id}:latest`,
    ports,
    schedule,
    resourceRecommendation: {
      cpuRequestMillicores: 100,
      cpuLimitMillicores: 200,
      memoryRequestMb: 128,
      memoryLimitMb: 256,
    },
    dependencies,
  };
}

function buildDiscovery() {
  return {
    runtime: {
      host: { hostname: "vm-a", os: "linux", distro: "Rocky 9", ip: "10.1.0.5" },
      processes: [
        {
          pid: 101,
          name: "api",
          command: "node index.js",
          user: "app",
          cpuPercent: 20,
          memoryMb: 256,
          listeningPorts: [8080],
          fileWrites: ["/data/api.log"],
          envHints: {},
        },
        {
          pid: 102,
          name: "worker",
          command: "python main.py",
          user: "app",
          cpuPercent: 10,
          memoryMb: 128,
          listeningPorts: [],
          fileWrites: [],
          envHints: {},
        },
      ],
      connections: [
        { processName: "api", toHost: "db.internal", toPort: 5432, protocol: "tcp" },
        { processName: "api", toHost: "db.internal", toPort: 5432, protocol: "tcp" },
      ],
      scheduledJobs: [
        { name: "worker-nightly", schedule: "0 2 * * *", command: "python worker", source: "cron" },
        { name: "orphan-job", schedule: "5 2 * * *", command: "run something-else", source: "cron" },
      ],
      source: {
        repositoryPath: "/srv/app",
        detectedStacks: ["nodejs", "python"],
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
}

test("generateArtifacts includes stack-specific dockerfiles and terraform variants", () => {
  const discovery = buildDiscovery();
  const decomposition = {
    recommendations: [
      rec({ id: "java", name: "java-api", kind: "Deployment", stack: "java-spring", ports: [8080] }),
      rec({ id: "dotnet", name: "dotnet-api", kind: "StatefulSet", stack: "dotnet", ports: [5000] }),
      rec({ id: "node", name: "node-api", kind: "Deployment", stack: "nodejs", ports: [3000] }),
      rec({ id: "py", name: "python-job", kind: "CronJob", stack: "python", schedule: "0 * * * *" }),
      rec({ id: "unk", name: "legacy", kind: "Deployment", stack: "unknown" }),
    ],
    blockers: ["manual check needed"],
  };

  const bundle = generateArtifacts("mig-1", discovery, decomposition);
  const byPath = new Map(bundle.artifacts.map((item) => [item.path, item.content]));

  assert.ok(byPath.get("docker/java/Dockerfile").includes("eclipse-temurin:21-jre-alpine"));
  assert.ok(byPath.get("docker/dotnet/Dockerfile").includes("mcr.microsoft.com/dotnet/aspnet:8.0-alpine"));
  assert.ok(byPath.get("docker/node/Dockerfile").includes("node:22-alpine"));
  assert.ok(byPath.get("docker/py/Dockerfile").includes("python:3.12-alpine"));
  assert.ok(byPath.get("docker/unk/Dockerfile").includes("override runtime command for legacy"));

  assert.ok(byPath.get("helm/values.yaml").includes('schedule: "0 * * * *"'));
  assert.ok(byPath.get("helm/values.yaml").includes("replicas: 1"));

  assert.ok(byPath.get("terraform/aws/main.tf").includes('provider "aws"'));
  assert.ok(byPath.get("terraform/azure/main.tf").includes('provider "azurerm"'));
  assert.ok(byPath.get("terraform/gcp/main.tf").includes('provider "google"'));
  assert.ok(byPath.get("terraform/openstack/main.tf").includes('provider "openstack"'));
  assert.ok(byPath.get("terraform/gcp/variables.tf").includes('variable "project_id"'));
  assert.ok(byPath.get("terraform/openstack/variables.tf").includes('variable "auth_url"'));
  assert.ok(byPath.get("reports/decomposition.md").includes("## Blockers"));
  assert.ok(byPath.get("reports/security-baseline.md").includes("Security Baseline Notes"));
  assert.ok(byPath.get("reports/vm-dna.json").includes('"hostname": "vm-a"'));
});

test("buildApplicationMaps and exportBundle write expected map and signoff outputs", () => {
  const discovery = buildDiscovery();
  const decomposition = {
    recommendations: [
      rec({
        id: "api",
        name: "api",
        kind: "Deployment",
        stack: "nodejs",
        ports: [8080],
        dependencies: ["db.internal:5432"],
      }),
      rec({ id: "worker", name: "worker", kind: "CronJob", stack: "python", schedule: "0 2 * * *" }),
    ],
    blockers: [],
  };
  const graph = buildVmDnaGraph("mig-2", discovery);
  const maps = buildApplicationMaps(graph, discovery, decomposition);

  assert.ok(maps.currentState.mermaid.includes("flowchart LR"));
  assert.ok(maps.currentState.mermaid.includes("scheduled"));
  assert.ok(maps.currentState.mermaid.includes("db.internal:5432"));
  assert.ok(maps.futureState.mermaid.includes("depends on"));
  assert.equal(maps.futureState.summary.byKind.Deployment, 1);
  assert.equal(maps.futureState.summary.byKind.CronJob, 1);

  const bundle = generateArtifacts("mig-2", discovery, decomposition);
  const outDir = mkdtempSync(join(tmpdir(), "stratosphere-export-"));
  const validation = { findings: [], readyForHumanReview: true, requiresHumanSignoff: true };
  const audit = {
    runId: "run-1",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    initiatedBy: "tester",
    inputHashSha256: "hash",
  };
  const signoffCheckpoint = { requiredApprovers: 2, approvalState: "PENDING", approvedBy: [] };

  exportBundle(outDir, bundle, discovery, graph, decomposition, maps, validation, audit, signoffCheckpoint);

  assert.ok(readFileSync(join(outDir, "reports/application-map-current.md"), "utf8").includes("Current-State Application Map"));
  assert.ok(readFileSync(join(outDir, "reports/application-map-future.md"), "utf8").includes("Future-State Application Map"));
  assert.ok(readFileSync(join(outDir, "reports/signoff-template.md"), "utf8").includes("Human Sign-Off Checkpoint"));
  assert.ok(readFileSync(join(outDir, "reports/blue-green-runbook.md"), "utf8").includes("Rollback"));
  assert.throws(() => readFileSync(join(outDir, "reports/repository-export.json"), "utf8"));

  const summaryJson = JSON.parse(readFileSync(join(outDir, "reports/migration-summary.json"), "utf8"));
  assert.equal(summaryJson.audit.runId, "run-1");
  assert.equal(summaryJson.graph.nodes, graph.nodes.length);

  const summaryLine = summarizeRun({
    discovery,
    graph,
    decomposition,
    applicationMaps: maps,
    strategy: "balanced",
    bundle,
    validation,
    audit,
    signoffCheckpoint,
  });
  assert.ok(summaryLine.includes("collector=snapshot"));
  assert.ok(summaryLine.includes("strategy=balanced"));
  assert.ok(summaryLine.includes("workloads=2"));

  rmSync(outDir, { recursive: true, force: true });
});
