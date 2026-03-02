export type WorkloadKind = "Deployment" | "StatefulSet" | "CronJob";

export type VmConnection = {
  host: string;
  port?: number;
  user: string;
  privateKeyPath?: string;
};

export type DiscoveryRequest = {
  migrationId: string;
  connection?: VmConnection;
  runtimeSnapshot?: RuntimeSnapshot;
};

export type RuntimeSnapshot = {
  host: {
    hostname: string;
    os: string;
    distro?: string;
    ip?: string;
  };
  processes: RuntimeProcess[];
  connections: RuntimeConnection[];
  scheduledJobs: ScheduledJob[];
  source?: SourceHints;
};

export type RuntimeProcess = {
  pid: number;
  name: string;
  command: string;
  user: string;
  cpuPercent: number;
  memoryMb: number;
  listeningPorts: number[];
  fileWrites: string[];
  envHints?: Record<string, string>;
};

export type RuntimeConnection = {
  processName: string;
  toHost: string;
  toPort: number;
  protocol: "tcp" | "udp";
};

export type ScheduledJob = {
  name: string;
  schedule: string;
  command: string;
  source: "cron" | "systemd-timer";
};

export type SourceHints = {
  repositoryPath?: string;
  detectedStacks: Array<"java-spring" | "dotnet" | "nodejs" | "python" | "unknown">;
  buildFiles: string[];
};

export type DiscoveryEvidence = {
  collector: string;
  commands: string[];
  warnings: string[];
  collectedAt: string;
};

export type DiscoveryResult = {
  runtime: RuntimeSnapshot;
  evidence: DiscoveryEvidence;
};

export interface DiscoveryAdapter {
  name: string;
  collect(request: DiscoveryRequest): Promise<DiscoveryResult>;
}

export type DnaNodeType =
  | "host"
  | "process"
  | "port"
  | "filesystem"
  | "external-service"
  | "scheduled-job"
  | "source-repo";

export type DnaEdgeType =
  | "runs"
  | "listens-on"
  | "writes-to"
  | "calls"
  | "scheduled-as"
  | "maps-to-source";

export type DnaNode = {
  id: string;
  type: DnaNodeType;
  label: string;
  attributes: Record<string, string | number | boolean>;
};

export type DnaEdge = {
  from: string;
  to: string;
  type: DnaEdgeType;
  attributes: Record<string, string | number | boolean>;
};

export type VmDnaGraph = {
  migrationId: string;
  nodes: DnaNode[];
  edges: DnaEdge[];
};

export type ResourceRecommendation = {
  cpuRequestMillicores: number;
  cpuLimitMillicores: number;
  memoryRequestMb: number;
  memoryLimitMb: number;
};

export type WorkloadRecommendation = {
  componentId: string;
  componentName: string;
  kind: WorkloadKind;
  confidence: number;
  rationale: string[];
  imageTag: string;
  ports: number[];
  resourceRecommendation: ResourceRecommendation;
  dependencies: string[];
  schedule?: string;
};

export type DecompositionResult = {
  recommendations: WorkloadRecommendation[];
  blockers: string[];
};

export type GeneratedArtifact = {
  path: string;
  content: string;
};

export type ArtifactBundle = {
  artifacts: GeneratedArtifact[];
};

export type ValidationFinding = {
  severity: "low" | "medium" | "high";
  message: string;
};

export type ValidationResult = {
  findings: ValidationFinding[];
  readyForHumanReview: boolean;
};

export type MigrationRunRequest = {
  migrationId: string;
  runtimeSnapshot: RuntimeSnapshot;
  outDir: string;
  connection?: VmConnection;
};

export type MigrationRunResult = {
  discovery: DiscoveryResult;
  graph: VmDnaGraph;
  decomposition: DecompositionResult;
  bundle: ArtifactBundle;
  validation: ValidationResult;
};
