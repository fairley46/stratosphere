import type {
  DecompositionResult,
  DiscoveryResult,
  ResourceRecommendation,
  RuntimeProcess,
  WorkloadKind,
  WorkloadRecommendation,
} from "./types.js";

const PERSISTENT_PATH_HINTS = ["/var/lib", "/data", "/mnt", "/srv", "/opt/data"];

function toComponentId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function aggregateResources(processes: RuntimeProcess[]): ResourceRecommendation {
  const cpuPeak = Math.max(...processes.map((p) => p.cpuPercent), 5);
  const memoryPeak = Math.max(...processes.map((p) => p.memoryMb), 128);

  const cpuRequestMillicores = Math.max(100, Math.round((cpuPeak * 10) * 0.7));
  const cpuLimitMillicores = Math.max(cpuRequestMillicores + 100, Math.round(cpuPeak * 10 * 1.4));
  const memoryRequestMb = Math.max(128, Math.round(memoryPeak * 0.75));
  const memoryLimitMb = Math.max(memoryRequestMb + 128, Math.round(memoryPeak * 1.5));

  return {
    cpuRequestMillicores,
    cpuLimitMillicores,
    memoryRequestMb,
    memoryLimitMb,
  };
}

function hasPersistentWrites(processes: RuntimeProcess[]): boolean {
  return processes.some((process) =>
    process.fileWrites.some((path) => PERSISTENT_PATH_HINTS.some((hint) => path.startsWith(hint)))
  );
}

function buildRationale(kind: WorkloadKind, flags: { persistent: boolean; scheduled: boolean }): string[] {
  const rationale: string[] = [];

  if (flags.scheduled) {
    rationale.push("Observed cron/systemd timer activity mapped to this component.");
  }

  if (flags.persistent) {
    rationale.push("Detected persistent file writes under stateful filesystem paths.");
  }

  if (kind === "Deployment") {
    rationale.push("No stateful write requirements detected; safe stateless default.");
  }

  if (kind === "StatefulSet") {
    rationale.push("Persistent volume claim recommended to preserve writable state.");
  }

  if (kind === "CronJob") {
    rationale.push("Batch scheduling pattern indicates Job/CronJob execution model.");
  }

  return rationale;
}

function detectKind(persistent: boolean, scheduled: boolean): WorkloadKind {
  if (scheduled) return "CronJob";
  if (persistent) return "StatefulSet";
  return "Deployment";
}

function isJobMappedToComponent(componentName: string, componentCommands: string[], jobCommand: string): boolean {
  if (jobCommand.includes(componentName)) return true;
  if (componentCommands.some((command) => jobCommand.includes(command) || command.includes(jobCommand))) return true;

  const normalizedJob = jobCommand.toLowerCase();
  const normalizedName = componentName.toLowerCase().replace(/-/g, " ");
  return normalizedJob.includes(normalizedName);
}

function confidenceFor(kind: WorkloadKind, persistent: boolean, scheduled: boolean): number {
  let confidence = 0.82;

  if (kind === "CronJob" && scheduled) confidence += 0.1;
  if (kind === "StatefulSet" && persistent) confidence += 0.08;
  if (kind === "Deployment" && !persistent && !scheduled) confidence += 0.08;

  if (persistent && scheduled) confidence -= 0.08;

  return Math.max(0.55, Math.min(0.98, Number(confidence.toFixed(2))));
}

export function decomposeRuntime(discovery: DiscoveryResult): DecompositionResult {
  const byName = new Map<string, RuntimeProcess[]>();
  for (const process of discovery.runtime.processes) {
    const existing = byName.get(process.name);
    if (existing) {
      existing.push(process);
      continue;
    }
    byName.set(process.name, [process]);
  }

  const blockers: string[] = [];
  const recommendations: WorkloadRecommendation[] = [];

  for (const [name, processes] of byName.entries()) {
    const persistent = hasPersistentWrites(processes);
    const componentCommands = processes.map((process) => process.command);
    const scheduledJobs = discovery.runtime.scheduledJobs.filter((job) =>
      isJobMappedToComponent(name, componentCommands, job.command)
    );
    const scheduled = scheduledJobs.length > 0;
    const kind = detectKind(persistent, scheduled);
    const confidence = confidenceFor(kind, persistent, scheduled);

    if (persistent && kind === "Deployment") {
      blockers.push(`${name}: persistent writes detected but classified as Deployment.`);
    }

    const ports = Array.from(new Set(processes.flatMap((process) => process.listeningPorts))).sort((a, b) => a - b);
    const dependencies = Array.from(
      new Set(
        discovery.runtime.connections
          .filter((connection) => connection.processName === name)
          .map((connection) => `${connection.toHost}:${connection.toPort}`)
      )
    ).sort();

    recommendations.push({
      componentId: toComponentId(name),
      componentName: name,
      kind,
      confidence,
      rationale: buildRationale(kind, { persistent, scheduled }),
      imageTag: `${toComponentId(name)}:latest`,
      ports,
      resourceRecommendation: aggregateResources(processes),
      dependencies,
      schedule: scheduled ? scheduledJobs[0]?.schedule : undefined,
    });
  }

  recommendations.sort((a, b) => a.componentName.localeCompare(b.componentName));

  return {
    recommendations,
    blockers,
  };
}
