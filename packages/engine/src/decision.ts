import type {
  ApplicationWorkspace,
  BusinessIntake,
  DecompositionResult,
  MigrationStrategy,
  ValidationResult,
} from "./types.js";

export type StrategyOption = {
  strategy: MigrationStrategy;
  title: string;
  expectation: string;
  riskLevel: "low" | "medium" | "high";
  speedLevel: "slow" | "medium" | "fast";
};

export type StrategyOptionsReport = {
  options: StrategyOption[];
  recommended: MigrationStrategy;
  rationale: string;
};

export type ReadinessAssessment = {
  score: number;
  confidence: number;
  status: "READY" | "CONDITIONAL" | "NOT_READY";
  unknowns: string[];
  breakdown: {
    blockerPenalty: number;
    findingPenalty: number;
    confidencePenalty: number;
    unknownPenalty: number;
  };
  mermaid: string;
};

export type RoiEstimate = {
  assumptions: {
    vmBaseMonthlyUsd: number;
    vmSustainmentMonthlyUsd: number;
    vmSecurityOverheadMonthlyUsd: number;
    k8sOpsMonthlyUsd: number;
  };
  projections: {
    currentMonthlyUsd: number;
    projectedMonthlyUsd: number;
    monthlySavingsUsd: number;
    oneTimeMigrationUsd: number;
    paybackMonths: number | null;
  };
  notes: string[];
};

const STRATEGY_OPTIONS: StrategyOption[] = [
  {
    strategy: "minimal-change",
    title: "Minimal Change",
    expectation: "Fastest path with least refactor. Keeps architecture close to current behavior.",
    riskLevel: "low",
    speedLevel: "fast",
  },
  {
    strategy: "balanced",
    title: "Balanced",
    expectation: "Pragmatic modernization. Improves cloud-native patterns while controlling migration risk.",
    riskLevel: "medium",
    speedLevel: "medium",
  },
  {
    strategy: "aggressive-modernization",
    title: "Aggressive Modernization",
    expectation: "Largest architecture change and optimization potential. Highest effort and program risk.",
    riskLevel: "high",
    speedLevel: "slow",
  },
];

function countFindings(validation: ValidationResult): { high: number; medium: number; low: number } {
  return {
    high: validation.findings.filter((item) => item.severity === "high").length,
    medium: validation.findings.filter((item) => item.severity === "medium").length,
    low: validation.findings.filter((item) => item.severity === "low").length,
  };
}

function avgRecommendationConfidence(decomposition: DecompositionResult): number {
  if (decomposition.recommendations.length === 0) return 0.55;
  const sum = decomposition.recommendations.reduce((total, item) => total + item.confidence, 0);
  return Number((sum / decomposition.recommendations.length).toFixed(2));
}

export function buildStrategyOptionsReport(
  decomposition: DecompositionResult,
  validation: ValidationResult
): StrategyOptionsReport {
  const findingCounts = countFindings(validation);

  if (decomposition.blockers.length > 0 || findingCounts.high > 0) {
    return {
      options: STRATEGY_OPTIONS,
      recommended: "minimal-change",
      rationale: "Blockers/high-risk findings detected. Start with the lowest-risk migration path.",
    };
  }

  const statefulCount = decomposition.recommendations.filter((item) => item.kind === "StatefulSet").length;
  if (statefulCount >= 2) {
    return {
      options: STRATEGY_OPTIONS,
      recommended: "balanced",
      rationale: "Multiple stateful components suggest a controlled modernization path.",
    };
  }

  return {
    options: STRATEGY_OPTIONS,
    recommended: "aggressive-modernization",
    rationale: "Low blocker profile and simpler topology can support deeper modernization changes.",
  };
}

function collectUnknowns(intake?: BusinessIntake, workspace?: ApplicationWorkspace): string[] {
  const unknowns: string[] = [];
  if (!intake) {
    unknowns.push("Business intake not provided.");
  } else {
    if (intake.approvalContacts.length === 0) unknowns.push("Approval contacts are missing.");
    if (intake.complianceNeeds.length === 0) unknowns.push("Compliance requirements were not specified.");
  }

  if (!workspace) {
    unknowns.push("Application workspace not provided.");
  } else if (workspace.relationships.length === 0) {
    unknowns.push("Workspace relationships are not defined.");
  }

  return unknowns;
}

export function buildReadinessAssessment(input: {
  decomposition: DecompositionResult;
  validation: ValidationResult;
  intake?: BusinessIntake;
  workspace?: ApplicationWorkspace;
}): ReadinessAssessment {
  const { decomposition, validation, intake, workspace } = input;
  const findingCounts = countFindings(validation);
  const unknowns = collectUnknowns(intake, workspace);
  const avgConfidence = avgRecommendationConfidence(decomposition);

  const blockerPenalty = Math.min(60, decomposition.blockers.length * 25);
  const findingPenalty = Math.min(40, findingCounts.high * 15 + findingCounts.medium * 7 + findingCounts.low * 3);
  const confidencePenalty = Math.max(0, Math.round((1 - avgConfidence) * 30));
  const unknownPenalty = Math.min(20, unknowns.length * 5);

  const raw = 100 - blockerPenalty - findingPenalty - confidencePenalty - unknownPenalty;
  const score = Math.max(0, Math.min(100, raw));
  const confidence = Number(
    Math.max(0.55, Math.min(0.99, 0.95 - decomposition.blockers.length * 0.08 - unknowns.length * 0.04)).toFixed(2)
  );
  const status = score >= 80 ? "READY" : score >= 60 ? "CONDITIONAL" : "NOT_READY";

  const mermaid = [
    "flowchart LR",
    `  blockers[\"Blockers: ${decomposition.blockers.length}\"]`,
    `  findings[\"Findings: H${findingCounts.high}/M${findingCounts.medium}/L${findingCounts.low}\"]`,
    `  unknowns[\"Unknowns: ${unknowns.length}\"]`,
    `  confidence[\"Confidence: ${avgConfidence}\"]`,
    `  score[\"Readiness Score: ${score}\"]`,
    "  blockers --> score",
    "  findings --> score",
    "  unknowns --> score",
    "  confidence --> score",
  ].join("\n");

  return {
    score,
    confidence,
    status,
    unknowns,
    breakdown: {
      blockerPenalty,
      findingPenalty,
      confidencePenalty,
      unknownPenalty,
    },
    mermaid: `${mermaid}\n`,
  };
}

function strategyCostMultiplier(strategy: MigrationStrategy): number {
  if (strategy === "minimal-change") return 1.0;
  if (strategy === "balanced") return 1.25;
  return 1.5;
}

function strategySavingsFactor(strategy: MigrationStrategy): number {
  if (strategy === "minimal-change") return 0.85;
  if (strategy === "balanced") return 0.75;
  return 0.65;
}

export function buildRoiEstimate(input: {
  strategy: MigrationStrategy;
  processCount: number;
  intake?: BusinessIntake;
}): RoiEstimate {
  const { strategy, processCount, intake } = input;
  const vmBaseMonthlyUsd = Math.max(300, processCount * 120);
  const vmSustainmentMonthlyUsd = Math.max(150, processCount * 45);
  const vmSecurityOverheadMonthlyUsd = intake?.criticality === "high" ? 250 : intake?.criticality === "medium" ? 180 : 120;
  const k8sOpsMonthlyUsd = Math.max(120, processCount * 30);

  const currentMonthlyUsd = vmBaseMonthlyUsd + vmSustainmentMonthlyUsd + vmSecurityOverheadMonthlyUsd;
  const projectedMonthlyUsd = Math.round(vmBaseMonthlyUsd * strategySavingsFactor(strategy) + k8sOpsMonthlyUsd);
  const monthlySavingsUsd = Math.max(0, currentMonthlyUsd - projectedMonthlyUsd);
  const oneTimeMigrationUsd = Math.round((8_000 + processCount * 700) * strategyCostMultiplier(strategy));
  const paybackMonths = monthlySavingsUsd > 0 ? Number((oneTimeMigrationUsd / monthlySavingsUsd).toFixed(1)) : null;

  return {
    assumptions: {
      vmBaseMonthlyUsd,
      vmSustainmentMonthlyUsd,
      vmSecurityOverheadMonthlyUsd,
      k8sOpsMonthlyUsd,
    },
    projections: {
      currentMonthlyUsd,
      projectedMonthlyUsd,
      monthlySavingsUsd,
      oneTimeMigrationUsd,
      paybackMonths,
    },
    notes: [
      "ROI includes VM sustainment overhead and OS-level security maintenance exposure.",
      "Assumptions are defaults and should be adjusted with real finance and operations data.",
    ],
  };
}

export function renderStrategyOptionsMarkdown(report: StrategyOptionsReport): string {
  const lines = ["# Migration Strategy Options", ""];
  for (const option of report.options) {
    lines.push(`## ${option.title}`);
    lines.push(`- Strategy: ${option.strategy}`);
    lines.push(`- Expectation: ${option.expectation}`);
    lines.push(`- Risk: ${option.riskLevel}`);
    lines.push(`- Speed: ${option.speedLevel}`);
    lines.push("");
  }
  lines.push(`Recommended strategy: ${report.recommended}`);
  lines.push(`Rationale: ${report.rationale}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function renderReadinessMarkdown(assessment: ReadinessAssessment): string {
  return `# Readiness Assessment

- Score: ${assessment.score}
- Confidence: ${assessment.confidence}
- Status: ${assessment.status}
- Unknowns: ${assessment.unknowns.length}

## Penalty Breakdown
- blockerPenalty: ${assessment.breakdown.blockerPenalty}
- findingPenalty: ${assessment.breakdown.findingPenalty}
- confidencePenalty: ${assessment.breakdown.confidencePenalty}
- unknownPenalty: ${assessment.breakdown.unknownPenalty}

## Unknowns
${assessment.unknowns.length > 0 ? assessment.unknowns.map((item) => `- ${item}`).join("\n") : "- none"}

## Scoring Graph
\`\`\`mermaid
${assessment.mermaid.trimEnd()}
\`\`\`
`;
}

export function renderRoiMarkdown(roi: RoiEstimate): string {
  return `# ROI Estimate

## Monthly Model
- Current monthly cost (estimated): $${roi.projections.currentMonthlyUsd}
- Projected monthly cost (estimated): $${roi.projections.projectedMonthlyUsd}
- Monthly savings (estimated): $${roi.projections.monthlySavingsUsd}

## Migration Cost Model
- One-time migration effort (estimated): $${roi.projections.oneTimeMigrationUsd}
- Payback period (months): ${roi.projections.paybackMonths ?? "n/a"}

## Notes
${roi.notes.map((item) => `- ${item}`).join("\n")}
`;
}
