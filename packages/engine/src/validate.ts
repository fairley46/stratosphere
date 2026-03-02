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
  if (!values) {
    addFinding(findings, "high", "Missing helm/values.yaml artifact.");
  }

  if (values && !values.includes("components:")) {
    addFinding(findings, "high", "helm/values.yaml does not define components list.");
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
  };
}
