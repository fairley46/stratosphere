export type WorkloadKind = "Deployment" | "StatefulSet" | "CronJob";
export type DiscoveryMode = "snapshot" | "ssh" | "local";

export type StackType = "java-spring" | "dotnet" | "nodejs" | "python" | "unknown";

export type VmConnection = {
  host: string;
  port?: number;
  user: string;
  privateKeyPath?: string;
};

export type DiscoveryRequest = {
  migrationId: string;
  mode?: DiscoveryMode;
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
  detectedStacks: StackType[];
  buildFiles: string[];
};

export type CommandExecutionResult = {
  command: string;
  exitCode: number;
  stdoutSnippet: string;
  stderrSnippet: string;
  durationMs: number;
};

export type DiscoveryEvidence = {
  collector: string;
  commands: string[];
  warnings: string[];
  collectedAt: string;
  commandResults: CommandExecutionResult[];
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
  stack: StackType;
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
  requiresHumanSignoff: boolean;
};

export type RepositoryProvider = "github" | "gitlab";

export type RepositoryExportRequest = {
  provider: RepositoryProvider;
  owner: string;
  repository: string;
  visibility?: "private" | "internal" | "public";
  dryRun?: boolean;
};

export type RepositoryExportAction = {
  kind: "create-repository" | "create-branch" | "push-artifacts" | "open-merge-request";
  description: string;
  status: "planned" | "skipped";
};

export type RepositoryExportResult = {
  provider: RepositoryProvider;
  dryRun: boolean;
  actions: RepositoryExportAction[];
  warnings: string[];
};

export type BusinessCriticality = "low" | "medium" | "high";
export type DowntimeTolerance = "none" | "limited" | "flexible";

export type BusinessIntake = {
  applicationName: string;
  businessOwner: string;
  technicalOwner?: string;
  criticality: BusinessCriticality;
  downtimeTolerance: DowntimeTolerance;
  complianceNeeds: string[];
  vendorOwned: boolean;
  approvalContacts: string[];
  notes?: string;
};

export type WorkspaceAssetType = "vm" | "database" | "queue" | "external-service";

export type WorkspaceAsset = {
  id: string;
  type: WorkspaceAssetType;
  name: string;
  description?: string;
};

export type WorkspaceRelationship = {
  fromAssetId: string;
  toAssetId: string;
  description?: string;
};

export type ApplicationWorkspace = {
  workspaceName: string;
  assets: WorkspaceAsset[];
  relationships: WorkspaceRelationship[];
};

export type AuditMetadata = {
  runId: string;
  startedAt: string;
  completedAt: string;
  initiatedBy: string;
  inputHashSha256: string;
};

export type HumanSignoffCheckpoint = {
  requiredApprovers: number;
  approvalState: "PENDING" | "APPROVED";
  approvedBy: string[];
  approvedAt?: string;
};

export type ApplicationMaps = {
  currentState: {
    mermaid: string;
    markdown: string;
    summary: {
      host: RuntimeSnapshot["host"];
      processCount: number;
      scheduledJobCount: number;
      externalDependencyCount: number;
      graph: {
        nodeCount: number;
        edgeCount: number;
      };
    };
  };
  futureState: {
    mermaid: string;
    markdown: string;
    summary: {
      componentCount: number;
      blockers: string[];
      byKind: {
        Deployment: number;
        StatefulSet: number;
        CronJob: number;
      };
    };
  };
};

export type MigrationRunRequest = {
  migrationId: string;
  runtimeSnapshot?: RuntimeSnapshot;
  outDir: string;
  discoveryMode?: DiscoveryMode;
  connection?: VmConnection;
  initiatedBy?: string;
  signoffRequiredApprovers?: number;
  exportRequest?: RepositoryExportRequest;
  intake?: BusinessIntake;
  workspace?: ApplicationWorkspace;
};

export type MigrationRunResult = {
  discovery: DiscoveryResult;
  graph: VmDnaGraph;
  decomposition: DecompositionResult;
  applicationMaps: ApplicationMaps;
  bundle: ArtifactBundle;
  validation: ValidationResult;
  audit: AuditMetadata;
  signoffCheckpoint: HumanSignoffCheckpoint;
  exportResult?: RepositoryExportResult;
  intake?: BusinessIntake;
  workspace?: ApplicationWorkspace;
};
