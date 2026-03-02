export type WorkloadKind = "Deployment" | "StatefulSet" | "CronJob";
export type DiscoveryMode = "snapshot" | "ssh" | "local";
export type MigrationStrategy = "minimal-change" | "balanced" | "aggressive-modernization";

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
  profileWindowSamples?: RuntimeWindowSample[];
  source?: SourceHints;
};

export type RuntimeWindowSample = {
  capturedAt: string;
  processes: Array<{
    processName: string;
    cpuPercent: number;
    memoryMb: number;
  }>;
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
  secrets?: SecretReference[];
};

export type DecompositionResult = {
  recommendations: WorkloadRecommendation[];
  blockers: string[];
  vendorDetection?: VendorDetectionResult;
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
  branchName?: string;
  targetBranch?: string;
  providerApiBaseUrl?: string;
  providerWebBaseUrl?: string;
  executionTokenEnvVar?: string;
  authMode?: "token" | "oauth";
  commitAuthorName?: string;
  commitAuthorEmail?: string;
  dryRun?: boolean;
};

export type RepositoryExportAction = {
  kind: "create-repository" | "create-branch" | "push-artifacts" | "open-merge-request";
  description: string;
  status: "planned" | "skipped" | "executed" | "failed";
};

export type RepositoryExportResult = {
  provider: RepositoryProvider;
  dryRun: boolean;
  actions: RepositoryExportAction[];
  warnings: string[];
  execution?: {
    requested: boolean;
    executed: boolean;
    reference?: string;
    reason?: string;
    pullRequestUrl?: string;
  };
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
  strategy?: MigrationStrategy;
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
  strategy: MigrationStrategy;
  bundle: ArtifactBundle;
  validation: ValidationResult;
  audit: AuditMetadata;
  signoffCheckpoint: HumanSignoffCheckpoint;
  exportResult?: RepositoryExportResult;
  intake?: BusinessIntake;
  workspace?: ApplicationWorkspace;
};

export type ExecutionState =
  | "DRAFTING"
  | "DISCOVERED"
  | "REVIEW_REQUIRED"
  | "REVISION_REQUIRED"
  | "APPROVAL_PENDING"
  | "PREFLIGHT_RUNNING"
  | "EXECUTION_READY"
  | "EXECUTING"
  | "PAUSED_FOR_REVIEW"
  | "ROLLBACK_RUNNING"
  | "COMPLETED"
  | "FAILED";

export type ReviewDecision = "accept" | "request_changes";

export type ExecutionFeedback = {
  by: string;
  at: string;
  decision: ReviewDecision;
  notes: string;
};

export type ExecutionApproval = {
  by: string;
  at: string;
};

export type PreflightCheck = {
  id: string;
  title: string;
  passed: boolean;
  message: string;
};

export type VendorDetectionResult = {
  detected: Array<{ vendor: string; service: string; confidence: number; evidence: string }>;
  advisoryOnly: boolean;
  notes: string[];
};

export type SecretReference = {
  name: string;
  envVarName: string;
  source: "env-pattern" | "file-path" | "manual";
  confidence: number;
};

export type ExecutionStep = {
  id: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed" | "paused";
  startedAt?: string;
  completedAt?: string;
  details?: string;
};

export type ExportExecutionStatus = {
  requested: boolean;
  executed: boolean;
  provider?: RepositoryProvider;
  reference?: string;
  message: string;
};

export type ExecutionJob = {
  jobId: string;
  migrationId: string;
  bundleDir: string;
  targetPlatform: "kubernetes";
  targetEnvironment: string;
  state: ExecutionState;
  requiredApprovers: number;
  reviewFeedback: ExecutionFeedback[];
  approvals: ExecutionApproval[];
  preflightChecks: PreflightCheck[];
  executionSteps: ExecutionStep[];
  exportExecution: ExportExecutionStatus;
  revisionCount: number;
  lastUpdatedAt: string;
  kubeconfig?: string;
  kubeContext?: string;
  kubeNamespace?: string;
};
