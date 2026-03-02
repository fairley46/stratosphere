import type {
  DnaEdge,
  DnaNode,
  DiscoveryResult,
  RuntimeConnection,
  RuntimeProcess,
  ScheduledJob,
  VmDnaGraph,
} from "./types.js";

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function processId(process: RuntimeProcess): string {
  return `process:${slug(process.name)}:${process.pid}`;
}

function externalServiceId(connection: RuntimeConnection): string {
  return `external:${slug(connection.toHost)}:${connection.toPort}`;
}

function scheduledJobId(job: ScheduledJob): string {
  return `job:${slug(job.name)}`;
}

function addNode(nodes: DnaNode[], seen: Set<string>, node: DnaNode): void {
  if (seen.has(node.id)) return;
  seen.add(node.id);
  nodes.push(node);
}

function addEdge(edges: DnaEdge[], edge: DnaEdge): void {
  edges.push(edge);
}

export function buildVmDnaGraph(migrationId: string, discovery: DiscoveryResult): VmDnaGraph {
  const nodes: DnaNode[] = [];
  const edges: DnaEdge[] = [];
  const seenNodes = new Set<string>();

  const hostId = `host:${slug(discovery.runtime.host.hostname)}`;
  addNode(nodes, seenNodes, {
    id: hostId,
    type: "host",
    label: discovery.runtime.host.hostname,
    attributes: {
      os: discovery.runtime.host.os,
      distro: discovery.runtime.host.distro ?? "unknown",
      ip: discovery.runtime.host.ip ?? "unknown",
    },
  });

  for (const process of discovery.runtime.processes) {
    const pid = processId(process);
    addNode(nodes, seenNodes, {
      id: pid,
      type: "process",
      label: process.name,
      attributes: {
        pid: process.pid,
        command: process.command,
        user: process.user,
        cpuPercent: process.cpuPercent,
        memoryMb: process.memoryMb,
      },
    });

    addEdge(edges, {
      from: hostId,
      to: pid,
      type: "runs",
      attributes: {},
    });

    for (const port of process.listeningPorts) {
      const portId = `port:${port}`;
      addNode(nodes, seenNodes, {
        id: portId,
        type: "port",
        label: `:${port}`,
        attributes: { port },
      });

      addEdge(edges, {
        from: pid,
        to: portId,
        type: "listens-on",
        attributes: { protocol: "tcp" },
      });
    }

    for (const filePath of process.fileWrites) {
      const fsId = `fs:${slug(filePath)}`;
      addNode(nodes, seenNodes, {
        id: fsId,
        type: "filesystem",
        label: filePath,
        attributes: { path: filePath },
      });

      addEdge(edges, {
        from: pid,
        to: fsId,
        type: "writes-to",
        attributes: {},
      });
    }
  }

  for (const connection of discovery.runtime.connections) {
    const caller = discovery.runtime.processes.find((p) => p.name === connection.processName);
    if (!caller) continue;

    const callerId = processId(caller);
    const extId = externalServiceId(connection);

    addNode(nodes, seenNodes, {
      id: extId,
      type: "external-service",
      label: `${connection.toHost}:${connection.toPort}`,
      attributes: {
        host: connection.toHost,
        port: connection.toPort,
      },
    });

    addEdge(edges, {
      from: callerId,
      to: extId,
      type: "calls",
      attributes: {
        protocol: connection.protocol,
      },
    });
  }

  for (const job of discovery.runtime.scheduledJobs) {
    const jobId = scheduledJobId(job);
    addNode(nodes, seenNodes, {
      id: jobId,
      type: "scheduled-job",
      label: job.name,
      attributes: {
        schedule: job.schedule,
        source: job.source,
      },
    });

    const process = discovery.runtime.processes.find((p) => job.command.includes(p.name));
    if (!process) continue;

    addEdge(edges, {
      from: processId(process),
      to: jobId,
      type: "scheduled-as",
      attributes: { schedule: job.schedule },
    });
  }

  if (discovery.runtime.source?.repositoryPath) {
    const sourceId = `source:${slug(discovery.runtime.source.repositoryPath)}`;
    addNode(nodes, seenNodes, {
      id: sourceId,
      type: "source-repo",
      label: discovery.runtime.source.repositoryPath,
      attributes: {
        detectedStacks: discovery.runtime.source.detectedStacks.join(","),
        buildFiles: discovery.runtime.source.buildFiles.join(","),
      },
    });

    for (const process of discovery.runtime.processes) {
      addEdge(edges, {
        from: processId(process),
        to: sourceId,
        type: "maps-to-source",
        attributes: {},
      });
    }
  }

  return {
    migrationId,
    nodes,
    edges,
  };
}
