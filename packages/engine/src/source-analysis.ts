import type { DecompositionResult, DiscoveryResult, StackType } from "./types.js";

export type SourceAnalysisReport = {
  repositoryPath?: string;
  detectedStacks: StackType[];
  componentMappings: Array<{
    processName: string;
    componentId?: string;
    stack: StackType;
    command: string;
    buildFiles: string[];
  }>;
};

export function buildSourceAnalysis(discovery: DiscoveryResult, decomposition: DecompositionResult): SourceAnalysisReport {
  const componentByName = new Map(decomposition.recommendations.map((item) => [item.componentName, item]));
  const detectedStacks = discovery.runtime.source?.detectedStacks ?? [];
  const buildFiles = discovery.runtime.source?.buildFiles ?? [];

  return {
    repositoryPath: discovery.runtime.source?.repositoryPath,
    detectedStacks,
    componentMappings: discovery.runtime.processes.map((process) => {
      const component = componentByName.get(process.name);
      return {
        processName: process.name,
        componentId: component?.componentId,
        stack: component?.stack ?? "unknown",
        command: process.command,
        buildFiles,
      };
    }),
  };
}
