import type { BusinessIntake, DecompositionResult } from "./types.js";

export type CutoverStage = {
  id: string;
  title: string;
  ownerRole: string;
  estimatedMinutes: number;
  trafficPercent?: number;
  successCriteria: string[];
  rollbackTrigger: string;
};

export type RollbackSimulation = {
  name: string;
  trigger: string;
  expectedAction: string;
  confidence: number;
};

export type BlueGreenCutoverPlan = {
  mode: "blue-green";
  readinessGate: {
    minScore: number;
    currentScore?: number;
  };
  stages: CutoverStage[];
  rollbackSimulations: RollbackSimulation[];
  notes: string[];
};

function trafficShiftStages(): CutoverStage[] {
  return [
    {
      id: "shift-5",
      title: "Shift 5% traffic to green",
      ownerRole: "platform-owner",
      estimatedMinutes: 15,
      trafficPercent: 5,
      successCriteria: ["No elevated error rate", "Latency within baseline thresholds"],
      rollbackTrigger: "Error budget breach or dependency failures",
    },
    {
      id: "shift-25",
      title: "Shift 25% traffic to green",
      ownerRole: "platform-owner",
      estimatedMinutes: 20,
      trafficPercent: 25,
      successCriteria: ["SLOs hold for 15+ minutes", "No data integrity alerts"],
      rollbackTrigger: "SLO breach, DB error spikes, or operator abort",
    },
    {
      id: "shift-50",
      title: "Shift 50% traffic to green",
      ownerRole: "platform-owner",
      estimatedMinutes: 25,
      trafficPercent: 50,
      successCriteria: ["Error and latency stable", "Queue backlog within normal range"],
      rollbackTrigger: "Sustained queue backlog growth or health probe failures",
    },
    {
      id: "shift-100",
      title: "Shift 100% traffic to green",
      ownerRole: "platform-owner",
      estimatedMinutes: 30,
      trafficPercent: 100,
      successCriteria: ["Full traffic stable", "Final human go/no-go confirmation"],
      rollbackTrigger: "Critical alert, severe performance regression, or policy breach",
    },
  ];
}

export function buildBlueGreenCutoverPlan(input: {
  decomposition: DecompositionResult;
  intake?: BusinessIntake;
  readinessScore?: number;
}): BlueGreenCutoverPlan {
  const { decomposition, intake, readinessScore } = input;
  const statefulCount = decomposition.recommendations.filter((item) => item.kind === "StatefulSet").length;
  const cronCount = decomposition.recommendations.filter((item) => item.kind === "CronJob").length;

  const stages: CutoverStage[] = [
    {
      id: "prepare-green",
      title: "Prepare green environment",
      ownerRole: "platform-owner",
      estimatedMinutes: 30,
      successCriteria: ["Namespace and secrets created", "Baseline policies applied", "Connectivity validated"],
      rollbackTrigger: "Policy mismatch or missing prerequisites",
    },
    {
      id: "deploy-green",
      title: "Deploy generated workloads",
      ownerRole: "application-owner",
      estimatedMinutes: 35,
      successCriteria: [
        "All deployments/statefulsets are healthy",
        "Scheduled jobs validated in dry-run mode",
        "Logs and metrics routed externally",
      ],
      rollbackTrigger: "Repeated startup failures or missing dependencies",
    },
    ...trafficShiftStages(),
    {
      id: "stabilization-window",
      title: "Stabilization and rollback hold window",
      ownerRole: "operations",
      estimatedMinutes: 60,
      successCriteria: ["No critical alerts for full hold window", "Approvers confirm cutover completion"],
      rollbackTrigger: "SLO regression or unresolved high-priority incident",
    },
  ];

  const rollbackSimulations: RollbackSimulation[] = [
    {
      name: "Health Check Failure",
      trigger: "Readiness probes fail for two consecutive windows",
      expectedAction: "Route traffic back to blue immediately and freeze green updates.",
      confidence: 0.93,
    },
    {
      name: "SLO Breach",
      trigger: "Latency/error SLO breach at 25%+ traffic stage",
      expectedAction: "Rollback to previous stable stage and open incident workflow.",
      confidence: 0.9,
    },
    {
      name: "Data Path Regression",
      trigger: "Stateful write/read validation fails",
      expectedAction: "Abort cutover, restore blue path, and preserve diagnostics.",
      confidence: statefulCount > 0 ? 0.88 : 0.95,
    },
  ];

  const notes = [
    `Workload mix: ${decomposition.recommendations.length} total (${statefulCount} stateful, ${cronCount} scheduled).`,
    `Downtime tolerance: ${intake?.downtimeTolerance ?? "unspecified"}.`,
    "Human sign-off is required before and after cutover execution.",
  ];

  return {
    mode: "blue-green",
    readinessGate: {
      minScore: 70,
      currentScore: readinessScore,
    },
    stages,
    rollbackSimulations,
    notes,
  };
}

export function renderBlueGreenCutoverPlanMarkdown(plan: BlueGreenCutoverPlan): string {
  const lines: string[] = [];
  lines.push("# Blue/Green Cutover Plan");
  lines.push("");
  lines.push(`- Mode: ${plan.mode}`);
  lines.push(`- Readiness gate: ${plan.readinessGate.currentScore ?? "unknown"}/${plan.readinessGate.minScore}`);
  lines.push("");
  lines.push("## Stages");
  for (const stage of plan.stages) {
    lines.push(`- ${stage.id}: ${stage.title}`);
    lines.push(
      `  owner=${stage.ownerRole} eta=${stage.estimatedMinutes}m${stage.trafficPercent !== undefined ? ` traffic=${stage.trafficPercent}%` : ""}`
    );
    lines.push(`  rollbackTrigger=${stage.rollbackTrigger}`);
  }
  lines.push("");
  lines.push("## Rollback Simulations");
  for (const scenario of plan.rollbackSimulations) {
    lines.push(`- ${scenario.name} (confidence ${scenario.confidence})`);
    lines.push(`  trigger=${scenario.trigger}`);
    lines.push(`  expectedAction=${scenario.expectedAction}`);
  }
  lines.push("");
  lines.push("## Notes");
  for (const note of plan.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
