import type { DiscoveryResult, RuntimeWindowSample } from "./types.js";

export type RuntimeProfileSummary = {
  processCount: number;
  totalCpuPercent: number;
  totalMemoryMb: number;
  topCpuProcesses: Array<{ processName: string; cpuPercent: number }>;
  topMemoryProcesses: Array<{ processName: string; memoryMb: number }>;
};

export type RuntimeWindowProcessProfile = {
  processName: string;
  sampleCount: number;
  avgCpuPercent: number;
  peakCpuPercent: number;
  p95CpuPercent: number;
  avgMemoryMb: number;
  peakMemoryMb: number;
  p95MemoryMb: number;
  varianceScore: number;
  confidence: number;
};

export type RuntimeWindowProfile = {
  sampleCount: number;
  windowMinutes: number;
  processProfiles: RuntimeWindowProcessProfile[];
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[index];
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function normalizeSamples(discovery: DiscoveryResult): RuntimeWindowSample[] {
  const samples = discovery.runtime.profileWindowSamples ?? [];
  if (samples.length > 0) return samples;

  return [
    {
      capturedAt: discovery.evidence.collectedAt,
      processes: discovery.runtime.processes.map((process) => ({
        processName: process.name,
        cpuPercent: process.cpuPercent,
        memoryMb: process.memoryMb,
      })),
    },
  ];
}

function computeWindowMinutes(samples: RuntimeWindowSample[]): number {
  if (samples.length < 2) return 0;
  const timestamps = samples
    .map((sample) => Date.parse(sample.capturedAt))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (timestamps.length < 2) return 0;
  return Math.max(0, Math.round((timestamps[timestamps.length - 1] - timestamps[0]) / 60000));
}

export function buildRuntimeProfileSummary(discovery: DiscoveryResult): RuntimeProfileSummary {
  const processes = [...discovery.runtime.processes];
  const topCpu = [...processes]
    .sort((left, right) => right.cpuPercent - left.cpuPercent)
    .slice(0, 5)
    .map((process) => ({ processName: process.name, cpuPercent: process.cpuPercent }));
  const topMemory = [...processes]
    .sort((left, right) => right.memoryMb - left.memoryMb)
    .slice(0, 5)
    .map((process) => ({ processName: process.name, memoryMb: process.memoryMb }));

  return {
    processCount: processes.length,
    totalCpuPercent: Number(processes.reduce((sum, process) => sum + process.cpuPercent, 0).toFixed(2)),
    totalMemoryMb: processes.reduce((sum, process) => sum + process.memoryMb, 0),
    topCpuProcesses: topCpu,
    topMemoryProcesses: topMemory,
  };
}

export function buildRuntimeWindowProfile(discovery: DiscoveryResult): RuntimeWindowProfile {
  const samples = normalizeSamples(discovery);
  const byProcess = new Map<string, Array<{ cpuPercent: number; memoryMb: number }>>();

  for (const sample of samples) {
    for (const process of sample.processes) {
      const bucket = byProcess.get(process.processName) ?? [];
      bucket.push({ cpuPercent: process.cpuPercent, memoryMb: process.memoryMb });
      byProcess.set(process.processName, bucket);
    }
  }

  const processProfiles = [...byProcess.entries()].map(([processName, points]) => {
    const cpu = points.map((item) => item.cpuPercent);
    const memory = points.map((item) => item.memoryMb);
    const avgCpu = cpu.reduce((sum, value) => sum + value, 0) / cpu.length;
    const avgMemory = memory.reduce((sum, value) => sum + value, 0) / memory.length;
    const peakCpu = Math.max(...cpu);
    const peakMemory = Math.max(...memory);
    const varianceScore = round(
      Math.max(0, Math.min(1, (peakCpu - avgCpu) / Math.max(1, avgCpu) + (peakMemory - avgMemory) / Math.max(1, avgMemory)))
    );
    const confidence = round(Math.max(0.55, Math.min(0.99, 0.9 - varianceScore * 0.2 + Math.min(0.08, points.length * 0.01))));

    return {
      processName,
      sampleCount: points.length,
      avgCpuPercent: round(avgCpu),
      peakCpuPercent: round(peakCpu),
      p95CpuPercent: round(percentile(cpu, 95)),
      avgMemoryMb: round(avgMemory),
      peakMemoryMb: round(peakMemory),
      p95MemoryMb: round(percentile(memory, 95)),
      varianceScore,
      confidence,
    };
  });

  return {
    sampleCount: samples.length,
    windowMinutes: computeWindowMinutes(samples),
    processProfiles: processProfiles.sort((left, right) => right.avgCpuPercent - left.avgCpuPercent),
  };
}

export function renderRuntimeWindowProfileMarkdown(profile: RuntimeWindowProfile): string {
  const lines: string[] = [];
  lines.push("# Runtime Window Profile");
  lines.push("");
  lines.push(`- Sample count: ${profile.sampleCount}`);
  lines.push(`- Window (minutes): ${profile.windowMinutes}`);
  lines.push("");
  lines.push("## Per-Process Profile");

  if (profile.processProfiles.length === 0) {
    lines.push("- none");
    lines.push("");
    return `${lines.join("\n")}\n`;
  }

  for (const item of profile.processProfiles) {
    lines.push(`- ${item.processName}`);
    lines.push(
      `  avgCPU=${item.avgCpuPercent}% peakCPU=${item.peakCpuPercent}% p95CPU=${item.p95CpuPercent}% avgMem=${item.avgMemoryMb}MB peakMem=${item.peakMemoryMb}MB p95Mem=${item.p95MemoryMb}MB variance=${item.varianceScore} confidence=${item.confidence}`
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
