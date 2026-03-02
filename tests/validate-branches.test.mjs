import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateBundle, validateBundleDirectory } from "../packages/engine/dist/validate.js";

test("validateBundle reports a broad set of findings", () => {
  const bundle = {
    artifacts: [
      { path: "helm/values.yaml", content: "global: {}" },
      { path: "helm/templates/workloads.yaml", content: "apiVersion: apps/v1" },
      { path: "docker/good/Dockerfile", content: "FROM alpine\nUSER app\n" },
      { path: "docker/root/Dockerfile", content: "FROM alpine\n" },
      { path: "docker/cron-missing-schedule/Dockerfile", content: "FROM alpine\nUSER app\n" },
    ],
  };

  const decomposition = {
    recommendations: [
      {
        componentId: "good",
        componentName: "good",
        kind: "Deployment",
        stack: "nodejs",
        confidence: 0.5,
        rationale: [],
        imageTag: "good:latest",
        ports: [3000],
        resourceRecommendation: {
          cpuRequestMillicores: 100,
          cpuLimitMillicores: 200,
          memoryRequestMb: 128,
          memoryLimitMb: 256,
        },
        dependencies: [],
      },
      {
        componentId: "root",
        componentName: "root",
        kind: "StatefulSet",
        stack: "java-spring",
        confidence: 0.8,
        rationale: [],
        imageTag: "root:latest",
        ports: [],
        resourceRecommendation: {
          cpuRequestMillicores: 100,
          cpuLimitMillicores: 200,
          memoryRequestMb: 128,
          memoryLimitMb: 256,
        },
        dependencies: [],
      },
      {
        componentId: "cron-missing-schedule",
        componentName: "cron-missing-schedule",
        kind: "CronJob",
        stack: "python",
        confidence: 0.9,
        rationale: [],
        imageTag: "missing:latest",
        ports: [],
        resourceRecommendation: {
          cpuRequestMillicores: 100,
          cpuLimitMillicores: 200,
          memoryRequestMb: 128,
          memoryLimitMb: 256,
        },
        dependencies: [],
      },
      {
        componentId: "missing-docker",
        componentName: "missing-docker",
        kind: "Deployment",
        stack: "python",
        confidence: 0.9,
        rationale: [],
        imageTag: "missing-docker:latest",
        ports: [],
        resourceRecommendation: {
          cpuRequestMillicores: 100,
          cpuLimitMillicores: 200,
          memoryRequestMb: 128,
          memoryLimitMb: 256,
        },
        dependencies: [],
      },
    ],
    blockers: ["manual blocker"],
  };

  const result = validateBundle(bundle, decomposition);
  assert.equal(result.requiresHumanSignoff, true);
  assert.equal(result.readyForHumanReview, false);
  assert.ok(result.findings.some((item) => item.message.includes("does not define components list")));
  assert.ok(result.findings.some((item) => item.message.includes("missing readiness probes")));
  assert.ok(result.findings.some((item) => item.message.includes("missing explicit security contexts")));
  assert.ok(result.findings.some((item) => item.message.includes("does not run as non-root user")));
  assert.ok(result.findings.some((item) => item.message.includes("stateful but has no declared port")));
  assert.ok(result.findings.some((item) => item.message.includes("CronJob but schedule is missing")));
  assert.ok(result.findings.some((item) => item.message.includes("low decomposition confidence")));
  assert.ok(result.findings.some((item) => item.message.includes("Missing docker/missing-docker/Dockerfile")));
  assert.ok(result.findings.some((item) => item.message.includes("Blocker: manual blocker")));
});

test("validateBundle reports missing helm artifacts and empty recommendations", () => {
  const result = validateBundle(
    { artifacts: [] },
    {
      recommendations: [],
      blockers: [],
    }
  );

  assert.equal(result.readyForHumanReview, false);
  assert.ok(result.findings.some((item) => item.message.includes("No workload recommendations")));
  assert.ok(result.findings.some((item) => item.message.includes("Missing helm/values.yaml")));
  assert.ok(result.findings.some((item) => item.message.includes("Missing helm/templates/workloads.yaml")));
});

test("validateBundleDirectory handles missing roots and non-root dockerfiles", () => {
  const missingRoot = mkdtempSync(join(tmpdir(), "stratosphere-missing-"));
  const missingResult = validateBundleDirectory(join(missingRoot, "does-not-exist"));
  assert.equal(missingResult.readyForHumanReview, false);
  assert.ok(missingResult.findings.some((item) => item.message.includes("No Dockerfiles found")));
  rmSync(missingRoot, { recursive: true, force: true });

  const root = mkdtempSync(join(tmpdir(), "stratosphere-dir-"));
  mkdirSync(join(root, "helm/templates"), { recursive: true });
  mkdirSync(join(root, "reports"), { recursive: true });
  mkdirSync(join(root, "docker/api"), { recursive: true });

  writeFileSync(join(root, "helm/Chart.yaml"), "apiVersion: v2\n", "utf8");
  writeFileSync(join(root, "helm/values.yaml"), "components: []\n", "utf8");
  writeFileSync(join(root, "helm/templates/workloads.yaml"), "kind: Deployment\n", "utf8");
  writeFileSync(join(root, "reports/decomposition.md"), "# x\n", "utf8");
  writeFileSync(join(root, "reports/migration-summary.json"), "{}\n", "utf8");
  writeFileSync(join(root, "reports/signoff-checkpoint.json"), "{}\n", "utf8");
  writeFileSync(join(root, "docker/api/Dockerfile"), "FROM alpine\n", "utf8");

  const result = validateBundleDirectory(root);
  assert.equal(result.readyForHumanReview, true);
  assert.ok(result.findings.some((item) => item.message.includes("does not use non-root user")));

  rmSync(root, { recursive: true, force: true });
});
