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
    likelyBuildFile?: string;
    mappingConfidence: number;
    notes: string[];
  }>;
  warnings: string[];
};

const STACK_BUILD_HINTS: Record<StackType, string[]> = {
  "java-spring": ["pom.xml", "build.gradle", "settings.gradle"],
  dotnet: [".csproj", ".sln"],
  nodejs: ["package.json", "pnpm-lock.yaml", "yarn.lock"],
  python: ["pyproject.toml", "requirements.txt", "setup.py"],
  unknown: [],
};

function pickLikelyBuildFile(buildFiles: string[], stack: StackType): string | undefined {
  const hints = STACK_BUILD_HINTS[stack];
  if (hints.length === 0) return buildFiles[0];
  for (const hint of hints) {
    const match = buildFiles.find((file) => file.toLowerCase().includes(hint.toLowerCase()));
    if (match) return match;
  }
  return buildFiles[0];
}

function calculateMappingConfidence(processName: string, command: string, likelyBuildFile?: string): number {
  let score = 0.55;
  if (likelyBuildFile) score += 0.2;
  const loweredProcess = processName.toLowerCase();
  const loweredCommand = command.toLowerCase();
  if (loweredCommand.includes(loweredProcess)) score += 0.15;
  if (likelyBuildFile && loweredProcess.includes("worker")) score -= 0.05;
  return Number(Math.max(0.55, Math.min(0.98, score)).toFixed(2));
}

export function buildSourceAnalysis(discovery: DiscoveryResult, decomposition: DecompositionResult): SourceAnalysisReport {
  const componentByName = new Map(decomposition.recommendations.map((item) => [item.componentName, item]));
  const detectedStacks = discovery.runtime.source?.detectedStacks ?? [];
  const buildFiles = discovery.runtime.source?.buildFiles ?? [];
  const warnings: string[] = [];

  return {
    repositoryPath: discovery.runtime.source?.repositoryPath,
    detectedStacks,
    componentMappings: discovery.runtime.processes.map((process) => {
      const component = componentByName.get(process.name);
      const stack = component?.stack ?? "unknown";
      const likelyBuildFile = pickLikelyBuildFile(buildFiles, stack);
      const mappingConfidence = calculateMappingConfidence(process.name, process.command, likelyBuildFile);
      const notes: string[] = [];

      if (!component) notes.push("No direct decomposition component name match found.");
      if (!likelyBuildFile) notes.push("No build file hints provided by source analysis.");
      if (stack === "unknown") notes.push("Stack detection is unknown; verify mapping manually.");
      if (mappingConfidence < 0.7) {
        warnings.push(`Low source mapping confidence for process ${process.name}.`);
      }

      return {
        processName: process.name,
        componentId: component?.componentId,
        stack,
        command: process.command,
        buildFiles,
        likelyBuildFile,
        mappingConfidence,
        notes,
      };
    }),
    warnings,
  };
}
