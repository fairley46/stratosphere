import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildReadinessAssessment,
  buildRoiEstimate,
  buildStrategyOptionsReport,
  renderReadinessMarkdown,
  renderRoiMarkdown,
  renderStrategyOptionsMarkdown,
} from "./decision.js";
import { buildBusinessImpactReport, renderBusinessImpactMarkdown } from "./business-impact.js";
import { buildBlueGreenCutoverPlan, renderBlueGreenCutoverPlanMarkdown } from "./cutover.js";
import { buildGlossaryPack, renderGlossaryMarkdown } from "./glossary.js";
import { buildExecutiveSummary } from "./intake.js";
import { buildRuntimeProfileSummary, buildRuntimeWindowProfile, renderRuntimeWindowProfileMarkdown } from "./profile.js";
import { buildSourceAnalysis } from "./source-analysis.js";
import type {
  ApplicationWorkspace,
  ApplicationMaps,
  ArtifactBundle,
  AuditMetadata,
  BusinessIntake,
  DecompositionResult,
  DiscoveryResult,
  HumanSignoffCheckpoint,
  MigrationStrategy,
  MigrationRunResult,
  RepositoryExportResult,
  ValidationResult,
  VmDnaGraph,
} from "./types.js";

function writeArtifact(outDir: string, path: string, content: string): void {
  const target = join(outDir, path);
  mkdirSync(dirname(target), { recursive: true });
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
  for (const recommendation of decomposition.recommendations) {
    lines.push(`- ${recommendation.componentName} -> ${recommendation.kind} (confidence ${recommendation.confidence})`);
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

function signoffTemplate(checkpoint: HumanSignoffCheckpoint): string {
  return `# Human Sign-Off Checkpoint

- Approval state: ${checkpoint.approvalState}
- Required approvers: ${checkpoint.requiredApprovers}
- Current approvers: ${checkpoint.approvedBy.length}

## Required Reviewers
- Application owner
- Platform owner
- Security reviewer

## Approval Record
| Name | Role | Approved At |
|------|------|-------------|
|      |      |             |

## Final Decision
- [ ] Approved for blue/green deployment execution
- [ ] Rejected pending remediation
`;
}

function writeSummary(
  outDir: string,
  discovery: DiscoveryResult,
  graph: VmDnaGraph,
  decomposition: DecompositionResult,
  applicationMaps: ApplicationMaps,
  validation: ValidationResult,
  audit: AuditMetadata,
  signoffCheckpoint: HumanSignoffCheckpoint,
  strategy: MigrationStrategy = "balanced",
  intake?: BusinessIntake,
  workspace?: ApplicationWorkspace,
  exportResult?: RepositoryExportResult
): void {
  const strategyReport = buildStrategyOptionsReport(decomposition, validation);
  const readiness = buildReadinessAssessment({ decomposition, validation, intake, workspace });
  const roi = buildRoiEstimate({
    strategy,
    processCount: discovery.runtime.processes.length,
    intake,
  });
  const businessImpact = buildBusinessImpactReport({
    decomposition,
    validation,
    intake,
    workspace,
    readinessUnknowns: readiness.unknowns,
  });
  const cutoverPlan = buildBlueGreenCutoverPlan({
    decomposition,
    intake,
    readinessScore: readiness.score,
  });
  const runtimeWindowProfile = buildRuntimeWindowProfile(discovery);
  const sourceAnalysis = buildSourceAnalysis(discovery, decomposition);

  const summary = {
    runId: audit.runId,
    collectedAt: discovery.evidence.collectedAt,
    collector: discovery.evidence.collector,
    workloadCount: decomposition.recommendations.length,
    blockers: decomposition.blockers,
    applicationMaps: {
      currentStateSummary: applicationMaps.currentState.summary,
      futureStateSummary: applicationMaps.futureState.summary,
    },
    validation,
    signoffCheckpoint,
    intake,
    workspace,
    exportResult,
    graph: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
    },
    strategy,
    strategyReport,
    readiness,
    roi,
    businessImpact,
    cutoverPlan,
    runtimeProfile: buildRuntimeProfileSummary(discovery),
    runtimeWindowProfile,
    sourceAnalysis,
    audit,
  };

  writeArtifact(outDir, "reports/migration-summary.json", JSON.stringify(summary, null, 2));
}

export function exportBundle(
  outDir: string,
  bundle: ArtifactBundle,
  discovery: DiscoveryResult,
  graph: VmDnaGraph,
  decomposition: DecompositionResult,
  applicationMaps: ApplicationMaps,
  validation: ValidationResult,
  audit: AuditMetadata,
  signoffCheckpoint: HumanSignoffCheckpoint,
  strategy: MigrationStrategy = "balanced",
  intake?: BusinessIntake,
  workspace?: ApplicationWorkspace,
  exportResult?: RepositoryExportResult
): void {
  mkdirSync(outDir, { recursive: true });
  const strategyReport = buildStrategyOptionsReport(decomposition, validation);
  const readiness = buildReadinessAssessment({ decomposition, validation, intake, workspace });
  const roi = buildRoiEstimate({
    strategy,
    processCount: discovery.runtime.processes.length,
    intake,
  });
  const businessImpact = buildBusinessImpactReport({
    decomposition,
    validation,
    intake,
    workspace,
    readinessUnknowns: readiness.unknowns,
  });
  const cutoverPlan = buildBlueGreenCutoverPlan({
    decomposition,
    intake,
    readinessScore: readiness.score,
  });
  const glossary = buildGlossaryPack();
  const runtimeProfile = buildRuntimeProfileSummary(discovery);
  const runtimeWindowProfile = buildRuntimeWindowProfile(discovery);
  const sourceAnalysis = buildSourceAnalysis(discovery, decomposition);

  for (const artifact of bundle.artifacts) {
    writeArtifact(outDir, artifact.path, artifact.content);
  }

  writeArtifact(outDir, "reports/vm-dna-graph.json", JSON.stringify(graph, null, 2));
  writeArtifact(outDir, "reports/runtime-profile-summary.json", JSON.stringify(runtimeProfile, null, 2));
  writeArtifact(outDir, "reports/runtime-profile-window.json", JSON.stringify(runtimeWindowProfile, null, 2));
  writeArtifact(outDir, "reports/runtime-profile-window.md", renderRuntimeWindowProfileMarkdown(runtimeWindowProfile));
  writeArtifact(outDir, "reports/source-analysis.json", JSON.stringify(sourceAnalysis, null, 2));
  writeArtifact(outDir, "reports/migration-options.json", JSON.stringify(strategyReport, null, 2));
  writeArtifact(outDir, "reports/migration-options.md", renderStrategyOptionsMarkdown(strategyReport));
  writeArtifact(outDir, "reports/readiness.json", JSON.stringify(readiness, null, 2));
  writeArtifact(outDir, "reports/readiness.md", renderReadinessMarkdown(readiness));
  writeArtifact(outDir, "reports/roi-estimate.json", JSON.stringify(roi, null, 2));
  writeArtifact(outDir, "reports/roi-estimate.md", renderRoiMarkdown(roi));
  writeArtifact(outDir, "reports/business-impact.json", JSON.stringify(businessImpact, null, 2));
  writeArtifact(outDir, "reports/business-impact.md", renderBusinessImpactMarkdown(businessImpact));
  writeArtifact(outDir, "reports/cutover-plan.json", JSON.stringify(cutoverPlan, null, 2));
  writeArtifact(outDir, "reports/cutover-plan.md", renderBlueGreenCutoverPlanMarkdown(cutoverPlan));
  writeArtifact(outDir, "reports/glossary.json", JSON.stringify(glossary, null, 2));
  writeArtifact(outDir, "reports/glossary.md", renderGlossaryMarkdown(glossary));
  writeArtifact(outDir, "reports/application-map-current.md", applicationMaps.currentState.markdown);
  writeArtifact(outDir, "reports/application-map-current.mmd", applicationMaps.currentState.mermaid);
  writeArtifact(outDir, "reports/application-map-current-summary.json", JSON.stringify(applicationMaps.currentState.summary, null, 2));
  writeArtifact(outDir, "reports/application-map-future.md", applicationMaps.futureState.markdown);
  writeArtifact(outDir, "reports/application-map-future.mmd", applicationMaps.futureState.mermaid);
  writeArtifact(outDir, "reports/application-map-future-summary.json", JSON.stringify(applicationMaps.futureState.summary, null, 2));
  writeArtifact(outDir, "reports/validation.json", JSON.stringify(validation, null, 2));
  writeArtifact(outDir, "reports/audit.json", JSON.stringify(audit, null, 2));
  writeArtifact(outDir, "reports/signoff-checkpoint.json", JSON.stringify(signoffCheckpoint, null, 2));
  writeArtifact(outDir, "reports/signoff-template.md", signoffTemplate(signoffCheckpoint));
  if (intake) {
    writeArtifact(outDir, "reports/intake.json", JSON.stringify(intake, null, 2));
  }
  if (workspace) {
    writeArtifact(outDir, "reports/workspace.json", JSON.stringify(workspace, null, 2));
  }
  if (exportResult) {
    writeArtifact(outDir, "reports/repository-export.json", JSON.stringify(exportResult, null, 2));
  }
  writeArtifact(
    outDir,
    "reports/executive-summary.md",
    buildExecutiveSummary({
      migrationId: graph.migrationId,
      intake,
      workspace,
      decomposition,
      validation,
    })
  );
  writeArtifact(
    outDir,
    "reports/executive-pack.json",
    JSON.stringify(
      {
        migrationId: graph.migrationId,
        strategy,
        strategyReport,
        readiness,
        roi,
        businessImpact,
        cutoverPlan,
        intake,
        workspace,
      },
      null,
      2
    )
  );
  writeArtifact(
    outDir,
    "reports/executive-pack.md",
    [
      "# Executive Pack",
      "",
      `Migration ID: ${graph.migrationId}`,
      `Selected strategy: ${strategy}`,
      "",
      "## Readiness",
      `- Score: ${readiness.score}`,
      `- Confidence: ${readiness.confidence}`,
      `- Status: ${readiness.status}`,
      "",
      "## Recommended Strategy",
      `- ${strategyReport.recommended}`,
      `- ${strategyReport.rationale}`,
      "",
      "## ROI Snapshot",
      `- Current monthly: $${roi.projections.currentMonthlyUsd}`,
      `- Projected monthly: $${roi.projections.projectedMonthlyUsd}`,
      `- Monthly savings: $${roi.projections.monthlySavingsUsd}`,
      `- One-time migration: $${roi.projections.oneTimeMigrationUsd}`,
      `- Payback (months): ${roi.projections.paybackMonths ?? "n/a"}`,
      "",
      "## Top Risks",
      ...businessImpact.topRisks.map((item) => `- ${item.category}: ${item.severity}`),
      "",
      "## Cutover Plan",
      `- Mode: ${cutoverPlan.mode}`,
      `- Stage count: ${cutoverPlan.stages.length}`,
      `- Rollback simulations: ${cutoverPlan.rollbackSimulations.length}`,
      "",
    ].join("\n")
  );

  writeArtifact(outDir, "reports/blue-green-runbook.md", blueGreenRunbook(decomposition));
  writeSummary(
    outDir,
    discovery,
    graph,
    decomposition,
    applicationMaps,
    validation,
    audit,
    signoffCheckpoint,
    strategy,
    intake,
    workspace,
    exportResult
  );
}

export function summarizeRun(result: MigrationRunResult): string {
  return [
    `runId=${result.audit.runId}`,
    `collector=${result.discovery.evidence.collector}`,
    `strategy=${result.strategy}`,
    `workloads=${result.decomposition.recommendations.length}`,
    `blockers=${result.decomposition.blockers.length}`,
    `findings=${result.validation.findings.length}`,
    `readyForHumanReview=${result.validation.readyForHumanReview}`,
    `signoff=${result.signoffCheckpoint.approvalState}`,
  ].join(" ");
}
