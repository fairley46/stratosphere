import { createHash, randomUUID } from "node:crypto";
import { buildVmDnaGraph } from "./graph.js";
import { decomposeRuntime } from "./decompose.js";
import { generateArtifacts } from "./generate.js";
import { validateBundle } from "./validate.js";
import { SshDiscoveryAdapter, SnapshotDiscoveryAdapter } from "./discovery.js";
import { exportBundle } from "./export.js";
import { planRepositoryExport } from "./repository-export.js";
import type {
  AuditMetadata,
  DecompositionResult,
  DiscoveryAdapter,
  DiscoveryRequest,
  HumanSignoffCheckpoint,
  MigrationRunRequest,
  MigrationRunResult,
  RuntimeSnapshot,
  VmDnaGraph,
} from "./types.js";

function pickAdapter(request: DiscoveryRequest): DiscoveryAdapter {
  if (request.connection) return new SshDiscoveryAdapter();
  return new SnapshotDiscoveryAdapter();
}

function hashInput(migrationId: string, runtimeSnapshot: RuntimeSnapshot): string {
  return createHash("sha256").update(`${migrationId}:${JSON.stringify(runtimeSnapshot)}`).digest("hex");
}

function buildAudit(request: MigrationRunRequest, startedAt: string): AuditMetadata {
  return {
    runId: randomUUID(),
    startedAt,
    completedAt: startedAt,
    initiatedBy: request.initiatedBy ?? "unknown",
    inputHashSha256: hashInput(request.migrationId, request.runtimeSnapshot),
  };
}

function buildSignoffCheckpoint(request: MigrationRunRequest): HumanSignoffCheckpoint {
  return {
    requiredApprovers: Math.max(1, request.signoffRequiredApprovers ?? 1),
    approvalState: "PENDING",
    approvedBy: [],
  };
}

export type DecompositionPreview = {
  graph: VmDnaGraph;
  decomposition: DecompositionResult;
};

export function previewDecomposition(migrationId: string, runtimeSnapshot: RuntimeSnapshot): DecompositionPreview {
  const discovery = {
    runtime: runtimeSnapshot,
    evidence: {
      collector: "snapshot",
      commands: [],
      warnings: [],
      collectedAt: new Date().toISOString(),
      commandResults: [],
    },
  };

  return {
    graph: buildVmDnaGraph(migrationId, discovery),
    decomposition: decomposeRuntime(discovery),
  };
}

export async function runMigrationPipeline(request: MigrationRunRequest): Promise<MigrationRunResult> {
  const startedAt = new Date().toISOString();
  const audit = buildAudit(request, startedAt);

  const adapter = pickAdapter({
    migrationId: request.migrationId,
    connection: request.connection,
    runtimeSnapshot: request.runtimeSnapshot,
  });

  const discovery = await adapter.collect({
    migrationId: request.migrationId,
    connection: request.connection,
    runtimeSnapshot: request.runtimeSnapshot,
  });

  const graph = buildVmDnaGraph(request.migrationId, discovery);
  const decomposition = decomposeRuntime(discovery);
  const bundle = generateArtifacts(request.migrationId, discovery, decomposition);
  const validation = validateBundle(bundle, decomposition);
  const signoffCheckpoint = buildSignoffCheckpoint(request);
  const exportResult = planRepositoryExport(bundle, request.exportRequest);

  audit.completedAt = new Date().toISOString();

  const result: MigrationRunResult = {
    discovery,
    graph,
    decomposition,
    bundle,
    validation,
    audit,
    signoffCheckpoint,
    exportResult,
  };

  exportBundle(
    request.outDir,
    bundle,
    discovery,
    graph,
    decomposition,
    validation,
    audit,
    signoffCheckpoint,
    exportResult
  );

  return result;
}
