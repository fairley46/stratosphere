import { createHash, randomUUID } from "node:crypto";
import { buildVmDnaGraph } from "./graph.js";
import { decomposeRuntime } from "./decompose.js";
import { generateArtifacts } from "./generate.js";
import { validateBundle } from "./validate.js";
import { buildApplicationMaps } from "./maps.js";
import { LocalDiscoveryAdapter, SshDiscoveryAdapter, SnapshotDiscoveryAdapter } from "./discovery.js";
import { exportBundle } from "./export.js";
import { planRepositoryExport } from "./repository-export.js";
import { StratosphereError } from "./errors.js";
import type {
  AuditMetadata,
  DecompositionResult,
  DiscoveryAdapter,
  DiscoveryRequest,
  HumanSignoffCheckpoint,
  MigrationRunRequest,
  MigrationRunResult,
  DiscoveryMode,
  RuntimeSnapshot,
  VmDnaGraph,
} from "./types.js";

function pickAdapter(request: DiscoveryRequest): DiscoveryAdapter {
  if (request.mode === "local") return new LocalDiscoveryAdapter();
  if (request.mode === "ssh") return new SshDiscoveryAdapter();
  if (request.mode === "snapshot") return new SnapshotDiscoveryAdapter();
  if (request.connection) return new SshDiscoveryAdapter();
  return new SnapshotDiscoveryAdapter();
}

function hashInput(migrationId: string, runtimeSnapshot: RuntimeSnapshot | undefined, mode: DiscoveryMode): string {
  const base = runtimeSnapshot ? JSON.stringify(runtimeSnapshot) : `mode:${mode}:no-runtime-snapshot`;
  return createHash("sha256").update(`${migrationId}:${base}`).digest("hex");
}

function buildAudit(request: MigrationRunRequest, startedAt: string, mode: DiscoveryMode): AuditMetadata {
  return {
    runId: randomUUID(),
    startedAt,
    completedAt: startedAt,
    initiatedBy: request.initiatedBy ?? "unknown",
    inputHashSha256: hashInput(request.migrationId, request.runtimeSnapshot, mode),
  };
}

function buildSignoffCheckpoint(request: MigrationRunRequest): HumanSignoffCheckpoint {
  return {
    requiredApprovers: Math.max(1, request.signoffRequiredApprovers ?? 1),
    approvalState: "PENDING",
    approvedBy: [],
  };
}

export const __orchestratorTestables = {
  pickAdapter,
  hashInput,
  buildAudit,
  buildSignoffCheckpoint,
};

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
  const mode: DiscoveryMode = request.discoveryMode ?? (request.connection ? "ssh" : "snapshot");
  if (mode === "snapshot" && !request.runtimeSnapshot) {
    throw new StratosphereError({
      code: "INPUT_MISSING",
      message: "runtimeSnapshot is required when discoveryMode is snapshot.",
      hint: "Provide a runtime file or switch discovery mode to local/ssh.",
      details: { mode },
    });
  }

  const audit = buildAudit(request, startedAt, mode);

  const adapter = pickAdapter({
    migrationId: request.migrationId,
    mode,
    connection: request.connection,
    runtimeSnapshot: request.runtimeSnapshot,
  });

  const discovery = await adapter.collect({
    migrationId: request.migrationId,
    mode,
    connection: request.connection,
    runtimeSnapshot: request.runtimeSnapshot,
  });

  const graph = buildVmDnaGraph(request.migrationId, discovery);
  const decomposition = decomposeRuntime(discovery);
  if (request.intake?.vendorOwned) {
    decomposition.blockers.push(
      "Vendor-owned application detected. Advisory-only mode: validate recommendations with vendor before implementation."
    );
  }
  const applicationMaps = buildApplicationMaps(graph, discovery, decomposition);
  const bundle = generateArtifacts(request.migrationId, discovery, decomposition);
  const validation = validateBundle(bundle, decomposition);
  const signoffCheckpoint = buildSignoffCheckpoint(request);
  const exportResult = planRepositoryExport(bundle, request.exportRequest);

  audit.completedAt = new Date().toISOString();

  const result: MigrationRunResult = {
    discovery,
    graph,
    decomposition,
    applicationMaps,
    bundle,
    validation,
    audit,
    signoffCheckpoint,
    intake: request.intake,
    workspace: request.workspace,
    exportResult,
  };

  exportBundle(
    request.outDir,
    bundle,
    discovery,
    graph,
    decomposition,
    applicationMaps,
    validation,
    audit,
    signoffCheckpoint,
    request.intake,
    request.workspace,
    exportResult
  );

  return result;
}
