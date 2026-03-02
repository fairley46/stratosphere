import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  ArtifactBundle,
  DecompositionResult,
  DiscoveryResult,
  MigrationRunResult,
  ValidationResult,
  VmDnaGraph,
} from "./types.js";

function writeArtifact(outDir: string, path: string, content: string): void {
  const target = join(outDir, path);
  const parent = dirname(target);
  mkdirSync(parent, { recursive: true });
  writeFileSync(target, content, "utf8");
}

function blueGreenRunbook(decomposition: DecompositionResult): string {
  const lines: string[] = [];
  lines.push("# Blue/Green Runbook");
  lines.push("");
  lines.push("## Safety Rules");
  lines.push("- Keep source VM workload running during full validation.");
  lines.push("- Route green traffic gradually after health checks pass.");
  lines.push("- Maintain rollback path to blue environment until acceptance sign-off.");
  lines.push("");
  lines.push("## Workloads in Scope");
  for (const rec of decomposition.recommendations) {
    lines.push(`- ${rec.componentName} -> ${rec.kind} (confidence ${rec.confidence})`);
  }
  lines.push("");
  lines.push("## Cutover Steps");
  lines.push("1. Deploy generated Helm chart to green namespace.");
  lines.push("2. Validate probes, logs, dependency reachability, and baseline SLOs.");
  lines.push("3. Shift 5% traffic to green, monitor, then increment to 25%, 50%, and 100%.");
  lines.push("4. Keep blue deployment active for rollback window.");
  lines.push("5. Record final human approval and migration completion notes.");
  lines.push("");
  lines.push("## Rollback");
  lines.push("1. Restore traffic to blue endpoint.");
  lines.push("2. Scale down green workloads only after incident triage completes.");
  lines.push("3. Preserve generated artifacts and logs for postmortem.");

  return `${lines.join("\n")}\n`;
}

function writeSummary(
  outDir: string,
  discovery: DiscoveryResult,
  graph: VmDnaGraph,
  decomposition: DecompositionResult,
  validation: ValidationResult
): void {
  const summary = {
    collectedAt: discovery.evidence.collectedAt,
    collector: discovery.evidence.collector,
    workloadCount: decomposition.recommendations.length,
    blockers: decomposition.blockers,
    validation,
    graph: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
    },
  };

  writeArtifact(outDir, "reports/migration-summary.json", JSON.stringify(summary, null, 2));
}

export function exportBundle(
  outDir: string,
  bundle: ArtifactBundle,
  discovery: DiscoveryResult,
  graph: VmDnaGraph,
  decomposition: DecompositionResult,
  validation: ValidationResult
): void {
  mkdirSync(outDir, { recursive: true });

  for (const artifact of bundle.artifacts) {
    writeArtifact(outDir, artifact.path, artifact.content);
  }

  writeArtifact(outDir, "reports/vm-dna-graph.json", JSON.stringify(graph, null, 2));
  writeArtifact(outDir, "reports/validation.json", JSON.stringify(validation, null, 2));
  writeArtifact(outDir, "reports/blue-green-runbook.md", blueGreenRunbook(decomposition));
  writeSummary(outDir, discovery, graph, decomposition, validation);
}

export function summarizeRun(result: MigrationRunResult): string {
  return [
    `collector=${result.discovery.evidence.collector}`,
    `workloads=${result.decomposition.recommendations.length}`,
    `blockers=${result.decomposition.blockers.length}`,
    `findings=${result.validation.findings.length}`,
    `readyForHumanReview=${result.validation.readyForHumanReview}`,
  ].join(" ");
}
