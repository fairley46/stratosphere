import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  getSshDiscoveryCommandSet,
  previewDecomposition,
  runMigrationPipeline,
  summarizeRun,
  validateBundleDirectory,
  type MigrationRunRequest,
  type RepositoryExportRequest,
  type RuntimeSnapshot,
  type VmConnection,
} from "@stratosphere/engine";
import { z } from "zod";

const server = new McpServer({
  name: "stratosphere",
  version: "0.2.0",
});

function loadRuntimeSnapshot(filePath: string): RuntimeSnapshot {
  const payload = readFileSync(filePath, "utf8");
  return JSON.parse(payload) as RuntimeSnapshot;
}

function buildConnection(
  sshHost?: string,
  sshUser?: string,
  sshPort?: number,
  sshKey?: string
): VmConnection | undefined {
  if (!sshHost || !sshUser) return undefined;
  return {
    host: sshHost,
    user: sshUser,
    port: sshPort,
    privateKeyPath: sshKey,
  };
}

function buildExportRequest(
  provider?: "github" | "gitlab",
  owner?: string,
  repository?: string,
  visibility?: "private" | "internal" | "public",
  exportExecute?: boolean
): RepositoryExportRequest | undefined {
  if (!provider) return undefined;
  if (!owner || !repository) {
    throw new Error("export_owner and export_repo are required when export_provider is provided.");
  }

  return {
    provider,
    owner,
    repository,
    visibility,
    dryRun: exportExecute ? false : true,
  };
}

function fail(code: string, message: string, details?: Record<string, unknown>) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            error: {
              code,
              message,
              details: details ?? {},
            },
          },
          null,
          2
        ),
      },
    ],
    isError: true,
  };
}

server.tool(
  "generate_migration_bundle",
  "Generate a Stratosphere migration bundle from runtime snapshot input, SSH interrogation, or local VM discovery.",
  {
    runtime_file: z.string().optional().describe("Optional path to runtime snapshot JSON"),
    local_discovery: z.boolean().optional().describe("Run read-only discovery directly on the host running this MCP server"),
    out_dir: z.string().default("artifacts/stratosphere").describe("Output directory for generated bundle"),
    migration_id: z.string().optional().describe("Optional migration id override"),
    initiated_by: z.string().optional().describe("Operator name for audit trail"),
    signoff_required_approvers: z.number().optional().describe("Required number of approvers for sign-off"),
    ssh_host: z.string().optional().describe("Optional SSH host metadata"),
    ssh_user: z.string().optional().describe("Optional SSH user metadata"),
    ssh_port: z.number().optional().describe("Optional SSH port metadata"),
    ssh_key: z.string().optional().describe("Optional SSH private key path metadata"),
    export_provider: z.enum(["github", "gitlab"]).optional().describe("Optional export provider"),
    export_owner: z.string().optional().describe("Repository owner/group"),
    export_repo: z.string().optional().describe("Repository name"),
    export_visibility: z.enum(["private", "internal", "public"]).optional().describe("Repository visibility"),
    export_execute: z.boolean().optional().describe("Set true to request non-dry-run export actions"),
  },
  async (input) => {
    const {
      runtime_file,
      local_discovery,
      out_dir,
      migration_id,
      initiated_by,
      signoff_required_approvers,
      ssh_host,
      ssh_user,
      ssh_port,
      ssh_key,
      export_provider,
      export_owner,
      export_repo,
      export_visibility,
      export_execute,
    } = input;

    try {
      const runtimeFile = runtime_file ? resolve(runtime_file) : undefined;
      const outputDir = resolve(out_dir);
      const runtimeSnapshot = runtimeFile ? loadRuntimeSnapshot(runtimeFile) : undefined;
      const connection = buildConnection(ssh_host, ssh_user, ssh_port, ssh_key);
      const discoveryMode = local_discovery ? "local" : connection ? "ssh" : "snapshot";

      if (!runtimeSnapshot && discoveryMode === "snapshot") {
        return fail(
          "INVALID_DISCOVERY_INPUT",
          "runtime_file is required unless local_discovery is true or ssh_host/ssh_user are provided.",
          { runtime_file, local_discovery, ssh_host, ssh_user }
        );
      }

      const request: MigrationRunRequest = {
        migrationId: migration_id ?? runtimeSnapshot?.host.hostname ?? "live-vm-migration",
        runtimeSnapshot,
        outDir: outputDir,
        discoveryMode,
        initiatedBy: initiated_by,
        signoffRequiredApprovers: signoff_required_approvers,
        connection: local_discovery ? undefined : connection,
        exportRequest: buildExportRequest(
          export_provider,
          export_owner,
          export_repo,
          export_visibility,
          export_execute
        ),
      };

      const result = await runMigrationPipeline(request);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                migrationId: request.migrationId,
                outDir: outputDir,
                summary: summarizeRun(result),
                recommendations: result.decomposition.recommendations.map((item) => ({
                  component: item.componentName,
                  kind: item.kind,
                  stack: item.stack,
                  confidence: item.confidence,
                  rationale: item.rationale,
                  dependencies: item.dependencies,
                })),
                blockers: result.decomposition.blockers,
                validation: result.validation,
                signoffCheckpoint: result.signoffCheckpoint,
                exportResult: result.exportResult,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return fail("MIGRATION_GENERATION_FAILED", String(error), {
        runtime_file,
        local_discovery,
        out_dir,
      });
    }
  }
);

server.tool(
  "list_ssh_discovery_commands",
  "List the read-only SSH command allowlist used for Stratosphere VM interrogation.",
  {},
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(getSshDiscoveryCommandSet(), null, 2),
      },
    ],
  })
);

server.tool(
  "generate_local_vm_bundle",
  "Generate a migration bundle by running read-only discovery on the same VM that hosts this MCP server.",
  {
    out_dir: z.string().default("artifacts/stratosphere").describe("Output directory for generated bundle"),
    migration_id: z.string().optional().describe("Optional migration id override"),
    runtime_file: z.string().optional().describe("Optional runtime snapshot fallback file"),
    initiated_by: z.string().optional().describe("Operator name for audit trail"),
    signoff_required_approvers: z.number().optional().describe("Required number of approvers for sign-off"),
  },
  async ({ out_dir, migration_id, runtime_file, initiated_by, signoff_required_approvers }) => {
    try {
      const outputDir = resolve(out_dir);
      const runtimeSnapshot = runtime_file ? loadRuntimeSnapshot(resolve(runtime_file)) : undefined;

      const request: MigrationRunRequest = {
        migrationId: migration_id ?? runtimeSnapshot?.host.hostname ?? "local-vm-migration",
        runtimeSnapshot,
        outDir: outputDir,
        discoveryMode: "local",
        initiatedBy: initiated_by,
        signoffRequiredApprovers: signoff_required_approvers,
      };

      const result = await runMigrationPipeline(request);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                migrationId: request.migrationId,
                outDir: outputDir,
                summary: summarizeRun(result),
                validation: result.validation,
                signoffCheckpoint: result.signoffCheckpoint,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return fail("LOCAL_VM_GENERATION_FAILED", String(error), {
        out_dir,
        runtime_file,
      });
    }
  }
);

server.tool(
  "validate_migration_bundle",
  "Validate an existing generated migration bundle without regenerating artifacts.",
  {
    bundle_dir: z.string().describe("Path to generated bundle directory"),
  },
  async ({ bundle_dir }) => {
    try {
      const bundleDir = resolve(bundle_dir);
      const validation = validateBundleDirectory(bundleDir);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                bundleDir,
                validation,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return fail("BUNDLE_VALIDATION_FAILED", String(error), { bundle_dir });
    }
  }
);

server.tool(
  "explain_decomposition",
  "Preview decomposition rationale and confidence from a runtime snapshot without writing artifacts.",
  {
    runtime_file: z.string().describe("Path to runtime snapshot JSON"),
    migration_id: z.string().optional().describe("Optional migration id override"),
  },
  async ({ runtime_file, migration_id }) => {
    try {
      const runtimeFile = resolve(runtime_file);
      const runtimeSnapshot = loadRuntimeSnapshot(runtimeFile);
      const preview = previewDecomposition(migration_id ?? runtimeSnapshot.host.hostname, runtimeSnapshot);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                migrationId: migration_id ?? runtimeSnapshot.host.hostname,
                graph: {
                  nodes: preview.graph.nodes.length,
                  edges: preview.graph.edges.length,
                },
                recommendations: preview.decomposition.recommendations.map((item) => ({
                  component: item.componentName,
                  kind: item.kind,
                  stack: item.stack,
                  confidence: item.confidence,
                  rationale: item.rationale,
                })),
                blockers: preview.decomposition.blockers,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return fail("DECOMPOSITION_PREVIEW_FAILED", String(error), { runtime_file });
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
