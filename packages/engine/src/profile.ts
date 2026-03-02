import type { DiscoveryResult } from "./types.js";

export type RuntimeProfileSummary = {
  processCount: number;
  totalCpuPercent: number;
  totalMemoryMb: number;
  topCpuProcesses: Array<{ processName: string; cpuPercent: number }>;
  topMemoryProcesses: Array<{ processName: string; memoryMb: number }>;
};

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
