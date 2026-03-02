import type {
  ApplicationMaps,
  DecompositionResult,
  DiscoveryResult,
  RuntimeConnection,
  RuntimeProcess,
  VmDnaGraph,
  WorkloadRecommendation,
} from "./types.js";

function mermaidId(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "node";
}

function escLabel(value: string): string {
  return value.replaceAll('"', "'");
}

function processNodeLabel(process: RuntimeProcess): string {
  const ports = process.listeningPorts.length > 0 ? `ports:${process.listeningPorts.join(",")}` : "ports:none";
  return `${process.name}\\n${ports}\\nmem:${process.memoryMb}Mi`;
}

function currentConnectionsForProcess(
  process: RuntimeProcess,
  connections: RuntimeConnection[]
): RuntimeConnection[] {
  return connections.filter((connection) => connection.processName === process.name);
}

function buildCurrentStateMermaid(discovery: DiscoveryResult): string {
  const lines: string[] = ["flowchart LR"];
  const hostNodeId = `host_${mermaidId(discovery.runtime.host.hostname)}`;
  lines.push(`  ${hostNodeId}[\"${escLabel(discovery.runtime.host.hostname)}\\n${escLabel(discovery.runtime.host.distro ?? discovery.runtime.host.os)}\"]`);

  const externalSeen = new Set<string>();
  const fsSeen = new Set<string>();

  for (const process of discovery.runtime.processes) {
    const processNodeId = `proc_${mermaidId(`${process.name}_${process.pid}`)}`;
    lines.push(`  ${processNodeId}[\"${escLabel(processNodeLabel(process))}\"]`);
    lines.push(`  ${hostNodeId} -->|runs| ${processNodeId}`);

    for (const connection of currentConnectionsForProcess(process, discovery.runtime.connections)) {
      const extId = `ext_${mermaidId(`${connection.toHost}_${connection.toPort}`)}`;
      if (!externalSeen.has(extId)) {
        lines.push(`  ${extId}([\"${escLabel(`${connection.toHost}:${connection.toPort}`)}\"])`);
        externalSeen.add(extId);
      }
      lines.push(`  ${processNodeId} -->|${connection.protocol}| ${extId}`);
    }

    for (const filePath of process.fileWrites) {
      const fsId = `fs_${mermaidId(filePath)}`;
      if (!fsSeen.has(fsId)) {
        lines.push(`  ${fsId}[[\"${escLabel(filePath)}\"]]`);
        fsSeen.add(fsId);
      }
      lines.push(`  ${processNodeId} -->|writes| ${fsId}`);
    }
  }

  for (const job of discovery.runtime.scheduledJobs) {
    const jobId = `job_${mermaidId(job.name)}`;
    lines.push(`  ${jobId}{\"${escLabel(`${job.name}\\n${job.schedule}`)}\"}`);

    const matchedProcess = discovery.runtime.processes.find((process) => job.command.includes(process.name));
    if (matchedProcess) {
      const processNodeId = `proc_${mermaidId(`${matchedProcess.name}_${matchedProcess.pid}`)}`;
      lines.push(`  ${processNodeId} -->|scheduled| ${jobId}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function workloadNodeLabel(workload: WorkloadRecommendation): string {
  return `${workload.componentName}\\n${workload.kind}\\n${workload.stack}`;
}

function buildFutureStateMermaid(decomposition: DecompositionResult): string {
  const lines: string[] = ["flowchart LR"];
  const clusterId = "k8s_cluster";
  lines.push(`  ${clusterId}([\"Kubernetes Target Cluster\"])`);

  const dependencySeen = new Set<string>();

  for (const workload of decomposition.recommendations) {
    const workloadId = `wl_${mermaidId(workload.componentId)}`;
    lines.push(`  ${workloadId}[\"${escLabel(workloadNodeLabel(workload))}\"]`);
    lines.push(`  ${clusterId} --> ${workloadId}`);

    for (const dependency of workload.dependencies) {
      const depId = `dep_${mermaidId(dependency)}`;
      if (!dependencySeen.has(depId)) {
        lines.push(`  ${depId}([\"${escLabel(dependency)}\"])`);
        dependencySeen.add(depId);
      }
      lines.push(`  ${workloadId} -->|depends on| ${depId}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function buildCurrentStateSummary(graph: VmDnaGraph, discovery: DiscoveryResult): ApplicationMaps["currentState"]["summary"] {
  return {
    host: discovery.runtime.host,
    processCount: discovery.runtime.processes.length,
    scheduledJobCount: discovery.runtime.scheduledJobs.length,
    externalDependencyCount: new Set(discovery.runtime.connections.map((connection) => `${connection.toHost}:${connection.toPort}`)).size,
    graph: {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
    },
  };
}

function buildFutureStateSummary(decomposition: DecompositionResult): ApplicationMaps["futureState"]["summary"] {
  return {
    componentCount: decomposition.recommendations.length,
    blockers: decomposition.blockers,
    byKind: {
      Deployment: decomposition.recommendations.filter((recommendation) => recommendation.kind === "Deployment").length,
      StatefulSet: decomposition.recommendations.filter((recommendation) => recommendation.kind === "StatefulSet").length,
      CronJob: decomposition.recommendations.filter((recommendation) => recommendation.kind === "CronJob").length,
    },
  };
}

function wrapMarkdown(title: string, mermaid: string, summary: unknown): string {
  return [
    `# ${title}`,
    "",
    "## Summary",
    "",
    "```json",
    JSON.stringify(summary, null, 2),
    "```",
    "",
    "## Diagram",
    "",
    "```mermaid",
    mermaid.trimEnd(),
    "```",
    "",
  ].join("\n");
}

export function buildApplicationMaps(
  graph: VmDnaGraph,
  discovery: DiscoveryResult,
  decomposition: DecompositionResult
): ApplicationMaps {
  const currentMermaid = buildCurrentStateMermaid(discovery);
  const currentSummary = buildCurrentStateSummary(graph, discovery);

  const futureMermaid = buildFutureStateMermaid(decomposition);
  const futureSummary = buildFutureStateSummary(decomposition);

  return {
    currentState: {
      mermaid: currentMermaid,
      markdown: wrapMarkdown("Current-State Application Map", currentMermaid, currentSummary),
      summary: currentSummary,
    },
    futureState: {
      mermaid: futureMermaid,
      markdown: wrapMarkdown("Future-State Application Map", futureMermaid, futureSummary),
      summary: futureSummary,
    },
  };
}
