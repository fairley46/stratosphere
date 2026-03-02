import type { ApplicationWorkspace, BusinessIntake, DecompositionResult, ValidationResult } from "./types.js";

export type ImpactSeverity = "low" | "medium" | "high";
export type ImpactCategory = "customer-risk" | "outage-risk" | "security-risk" | "operating-effort";

export type ImpactAssessment = {
  category: ImpactCategory;
  severity: ImpactSeverity;
  summary: string;
  rationale: string[];
};

export type BusinessImpactReport = {
  assessments: ImpactAssessment[];
  topRisks: ImpactAssessment[];
  recommendedActions: string[];
};

function hasHighFindings(validation: ValidationResult): boolean {
  return validation.findings.some((item) => item.severity === "high");
}

function statefulCount(decomposition: DecompositionResult): number {
  return decomposition.recommendations.filter((item) => item.kind === "StatefulSet").length;
}

function severityRank(severity: ImpactSeverity): number {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

export function buildBusinessImpactReport(input: {
  decomposition: DecompositionResult;
  validation: ValidationResult;
  intake?: BusinessIntake;
  workspace?: ApplicationWorkspace;
  readinessUnknowns?: string[];
}): BusinessImpactReport {
  const { decomposition, validation, intake, workspace, readinessUnknowns = [] } = input;
  const highFindings = hasHighFindings(validation);
  const blockers = decomposition.blockers.length;
  const stateful = statefulCount(decomposition);
  const recommendationCount = decomposition.recommendations.length;
  const criticality = intake?.criticality ?? "medium";
  const downtimeTolerance = intake?.downtimeTolerance ?? "limited";
  const complianceCount = intake?.complianceNeeds.length ?? 0;
  const unknowns = readinessUnknowns.length;

  const customerRiskSeverity: ImpactSeverity =
    criticality === "high" && (blockers > 0 || highFindings) ? "high" : blockers > 0 || highFindings ? "medium" : "low";
  const outageRiskSeverity: ImpactSeverity =
    downtimeTolerance === "none" && (stateful > 0 || blockers > 0)
      ? "high"
      : downtimeTolerance === "limited" && (stateful > 0 || blockers > 0)
        ? "medium"
        : "low";
  const securityRiskSeverity: ImpactSeverity =
    complianceCount > 0 && highFindings ? "high" : complianceCount > 0 || highFindings ? "medium" : "low";
  const operatingEffortSeverity: ImpactSeverity =
    recommendationCount >= 8 || unknowns >= 4 ? "high" : recommendationCount >= 4 || unknowns >= 2 ? "medium" : "low";

  const assessments: ImpactAssessment[] = [
    {
      category: "customer-risk",
      severity: customerRiskSeverity,
      summary:
        customerRiskSeverity === "high"
          ? "Customer-facing disruption risk is high without blocker remediation."
          : customerRiskSeverity === "medium"
            ? "Customer impact is possible and should be controlled with staged rollout."
            : "Customer disruption risk appears limited under staged cutover.",
      rationale: [
        `criticality=${criticality}`,
        `blockers=${blockers}`,
        `highFindings=${highFindings}`,
      ],
    },
    {
      category: "outage-risk",
      severity: outageRiskSeverity,
      summary:
        outageRiskSeverity === "high"
          ? "Outage risk is high; cutover should include strict rollback checkpoints."
          : outageRiskSeverity === "medium"
            ? "Outage risk is manageable with blue/green checkpoints."
            : "Outage risk is low with current dependency profile.",
      rationale: [
        `downtimeTolerance=${downtimeTolerance}`,
        `statefulWorkloads=${stateful}`,
        `blockers=${blockers}`,
      ],
    },
    {
      category: "security-risk",
      severity: securityRiskSeverity,
      summary:
        securityRiskSeverity === "high"
          ? "Security exposure remains high until critical findings and compliance controls are addressed."
          : securityRiskSeverity === "medium"
            ? "Security posture is improving but requires validation of controls."
            : "Security migration risk appears low with current findings.",
      rationale: [
        `complianceNeeds=${complianceCount}`,
        `highFindings=${highFindings}`,
      ],
    },
    {
      category: "operating-effort",
      severity: operatingEffortSeverity,
      summary:
        operatingEffortSeverity === "high"
          ? "Operational lift is high; plan phased delivery with clear owner checkpoints."
          : operatingEffortSeverity === "medium"
            ? "Operational effort is moderate and should be planned per component wave."
            : "Operational effort is limited for the current workload shape.",
      rationale: [
        `recommendations=${recommendationCount}`,
        `unknowns=${unknowns}`,
        `workspaceAssets=${workspace?.assets.length ?? 0}`,
      ],
    },
  ];

  const topRisks = [...assessments]
    .sort((left, right) => severityRank(right.severity) - severityRank(left.severity))
    .slice(0, 3);

  const recommendedActions = [
    blockers > 0
      ? "Resolve blockers and re-run readiness before scheduling cutover."
      : "Review high-confidence components first for phased rollout planning.",
    unknowns > 0
      ? "Assign owners for open unknowns and capture resolution evidence."
      : "Maintain evidence log for approvals and preflight checks.",
    "Use blue/green traffic shifts with rollback checkpoints at each gate.",
  ];

  return {
    assessments,
    topRisks,
    recommendedActions,
  };
}

export function renderBusinessImpactMarkdown(report: BusinessImpactReport): string {
  const lines: string[] = [];
  lines.push("# Business Impact");
  lines.push("");
  lines.push("## Impact Areas");
  for (const item of report.assessments) {
    lines.push(`- ${item.category}: ${item.severity}`);
    lines.push(`  ${item.summary}`);
  }
  lines.push("");
  lines.push("## Top Risks");
  for (const item of report.topRisks) {
    lines.push(`- ${item.category}: ${item.severity} - ${item.summary}`);
  }
  lines.push("");
  lines.push("## Recommended Actions");
  for (const action of report.recommendedActions) {
    lines.push(`- ${action}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
