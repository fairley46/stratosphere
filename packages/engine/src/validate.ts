import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactBundle, DecompositionResult, ValidationFinding, ValidationResult } from "./types.js";

function findArtifact(bundle: ArtifactBundle, path: string): string | undefined {
  return bundle.artifacts.find((item) => item.path === path)?.content;
}

function addFinding(findings: ValidationFinding[], severity: "low" | "medium" | "high", message: string): void {
  findings.push({ severity, message });
}

export function validateBundle(bundle: ArtifactBundle, decomposition: DecompositionResult): ValidationResult {
  const findings: ValidationFinding[] = [];

  if (decomposition.recommendations.length === 0) {
    addFinding(findings, "high", "No workload recommendations were generated.");
  }

  const values = findArtifact(bundle, "helm/values.yaml");
  const workloadsTemplate = findArtifact(bundle, "helm/templates/workloads.yaml");

  if (!values) {
    addFinding(findings, "high", "Missing helm/values.yaml artifact.");
  }

  if (values && !values.includes("components:")) {
    addFinding(findings, "high", "helm/values.yaml does not define components list.");
  }

  if (!workloadsTemplate) {
    addFinding(findings, "high", "Missing helm/templates/workloads.yaml artifact.");
  }

  if (workloadsTemplate && !workloadsTemplate.includes("readinessProbe")) {
    addFinding(findings, "high", "Workload template missing readiness probes.");
  }

  if (workloadsTemplate && !workloadsTemplate.includes("securityContext")) {
    addFinding(findings, "medium", "Workload template missing explicit security contexts.");
  }

  for (const recommendation of decomposition.recommendations) {
    const dockerfilePath = `docker/${recommendation.componentId}/Dockerfile`;
    const dockerfile = findArtifact(bundle, dockerfilePath);

    if (!dockerfile) {
      addFinding(findings, "high", `Missing ${dockerfilePath}.`);
      continue;
    }

    if (!dockerfile.includes("USER app")) {
      addFinding(findings, "medium", `${dockerfilePath} does not run as non-root user.`);
    }

    if (recommendation.kind === "StatefulSet" && recommendation.ports.length === 0) {
      addFinding(findings, "medium", `${recommendation.componentName} is stateful but has no declared port.`);
    }

    if (recommendation.kind === "CronJob" && !recommendation.schedule) {
      addFinding(findings, "high", `${recommendation.componentName} is a CronJob but schedule is missing.`);
    }

    if (recommendation.confidence < 0.65) {
      addFinding(
        findings,
        "medium",
        `${recommendation.componentName} has low decomposition confidence (${recommendation.confidence}).`
      );
    }
  }

  if (decomposition.blockers.length > 0) {
    for (const blocker of decomposition.blockers) {
      addFinding(findings, "high", `Blocker: ${blocker}`);
    }
  }

  const hasHighSeverity = findings.some((finding) => finding.severity === "high");

  return {
    findings,
    readyForHumanReview: !hasHighSeverity,
    requiresHumanSignoff: true,
  };
}

function listFilesRecursive(root: string): string[] {
  const out: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        out.push(full);
      }
    }
  }

  if (!existsSync(root)) return out;
  walk(root);
  return out;
}

export function validateBundleDirectory(bundleDir: string): ValidationResult {
  const findings: ValidationFinding[] = [];
  const requiredPaths = [
    "helm/Chart.yaml",
    "helm/values.yaml",
    "helm/templates/workloads.yaml",
    "reports/decomposition.md",
    "reports/migration-summary.json",
    "reports/signoff-checkpoint.json",
  ];

  for (const relativePath of requiredPaths) {
    if (!existsSync(join(bundleDir, relativePath))) {
      addFinding(findings, "high", `Missing ${relativePath}`);
    }
  }

  const dockerRoot = join(bundleDir, "docker");
  const dockerfiles = listFilesRecursive(dockerRoot).filter((file) => file.endsWith("Dockerfile"));
  if (dockerfiles.length === 0) {
    addFinding(findings, "high", "No Dockerfiles found in generated bundle.");
  }

  for (const dockerfile of dockerfiles) {
    const content = readFileSync(dockerfile, "utf8");
    if (!content.includes("USER app")) {
      addFinding(findings, "medium", `${dockerfile} does not use non-root user.`);
    }
  }

  const hasHighSeverity = findings.some((finding) => finding.severity === "high");

  return {
    findings,
    readyForHumanReview: !hasHighSeverity,
    requiresHumanSignoff: true,
  };
}
