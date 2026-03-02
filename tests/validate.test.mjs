import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateBundle, validateBundleDirectory } from "../packages/engine/dist/validate.js";

test("validateBundle enforces probes and human signoff requirement", () => {
  const bundle = {
    artifacts: [
      { path: "helm/values.yaml", content: "components:\n- id: api" },
      { path: "helm/templates/workloads.yaml", content: "readinessProbe:\nsecurityContext:" },
      { path: "docker/api/Dockerfile", content: "FROM alpine\nUSER app\n" },
    ],
  };

  const decomposition = {
    recommendations: [
      {
        componentId: "api",
        componentName: "api",
        kind: "Deployment",
        stack: "nodejs",
        confidence: 0.9,
        rationale: [],
        imageTag: "api:latest",
        ports: [8080],
        resourceRecommendation: {
          cpuRequestMillicores: 100,
          cpuLimitMillicores: 200,
          memoryRequestMb: 128,
          memoryLimitMb: 256,
        },
        dependencies: [],
      },
    ],
    blockers: [],
  };

  const result = validateBundle(bundle, decomposition);
  assert.equal(result.requiresHumanSignoff, true);
  assert.equal(result.readyForHumanReview, true);
});

test("validateBundleDirectory detects missing critical files", () => {
  const root = mkdtempSync(join(tmpdir(), "stratosphere-bundle-"));
  mkdirSync(join(root, "helm/templates"), { recursive: true });
  mkdirSync(join(root, "reports"), { recursive: true });

  writeFileSync(join(root, "helm/Chart.yaml"), "apiVersion: v2\n", "utf8");
  writeFileSync(join(root, "helm/values.yaml"), "components: []\n", "utf8");

  const result = validateBundleDirectory(root);
  assert.equal(result.readyForHumanReview, false);
  assert.ok(result.findings.some((finding) => finding.severity === "high"));

  rmSync(root, { recursive: true, force: true });
});
