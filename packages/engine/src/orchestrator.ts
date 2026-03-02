import { buildVmDnaGraph } from "./graph.js";
import { decomposeRuntime } from "./decompose.js";
import { generateArtifacts } from "./generate.js";
import { validateBundle } from "./validate.js";
import { SshDiscoveryAdapter, SnapshotDiscoveryAdapter } from "./discovery.js";
import { exportBundle } from "./export.js";
import type {
  DiscoveryAdapter,
  DiscoveryRequest,
  MigrationRunRequest,
  MigrationRunResult,
} from "./types.js";

function pickAdapter(request: DiscoveryRequest): DiscoveryAdapter {
  if (request.connection) return new SshDiscoveryAdapter();
  return new SnapshotDiscoveryAdapter();
}

export async function runMigrationPipeline(request: MigrationRunRequest): Promise<MigrationRunResult> {
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

  const result: MigrationRunResult = {
    discovery,
    graph,
    decomposition,
    bundle,
    validation,
  };

  exportBundle(request.outDir, bundle, discovery, graph, decomposition, validation);
  return result;
}
