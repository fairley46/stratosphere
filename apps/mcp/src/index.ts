import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  StratosphereError,
  validateApplicationWorkspace,
  validateBusinessIntake,
  buildApplicationMaps,
  getSshDiscoveryCommandSet,
  previewDecomposition,
  runMigrationPipeline,
  summarizeRun,
  toErrorPayload,
  validateBundleDirectory,
  type MigrationRunRequest,
  type RepositoryExportRequest,
  type ApplicationWorkspace,
  type BusinessIntake,
  type RuntimeSnapshot,
  type VmConnection,
} from "@stratosphere/engine";
import { z } from "zod";

const server = new McpServer({
  name: "stratosphere",
  version: "0.2.0",
});

function loadRuntimeSnapshot(filePath: string): RuntimeSnapshot {
  const payload = loadJsonFile(filePath, "runtime snapshot");
  return payload as RuntimeSnapshot;
}

function loadJsonFile(filePath: string, label: string): unknown {
  let payload: string;
  try {
    payload = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new StratosphereError({
      code: "FILE_READ_FAILED",
      message: `Unable to read ${label} file: ${filePath}`,
      hint: "Check that the file exists and is readable by the MCP process.",
      details: { filePath, reason: String(error) },
    });
  }

  try {
    return JSON.parse(payload) as unknown;
  } catch (error) {
    throw new StratosphereError({
      code: "JSON_PARSE_FAILED",
      message: `Invalid JSON in ${label} file: ${filePath}`,
      hint: "Fix JSON syntax and ensure runtime snapshot schema fields exist.",
      details: { filePath, reason: String(error) },
    });
  }
}

function buildConnection(
  sshHost?: string,
  sshUser?: string,
  sshPort?: number,
  sshKey?: string
): VmConnection | undefined {
  if ((sshHost && !sshUser) || (!sshHost && sshUser)) {
    throw new StratosphereError({
      code: "INPUT_MISSING",
      message: "ssh_host and ssh_user must be provided together.",
      hint: "Provide both ssh_host and ssh_user, or remove both when using snapshot/local discovery.",
      details: { sshHostProvided: Boolean(sshHost), sshUserProvided: Boolean(sshUser) },
    });
  }

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
    throw new StratosphereError({
      code: "INPUT_MISSING",
      message: "export_owner and export_repo are required when export_provider is provided.",
      hint: "Provide both export_owner and export_repo when using export_provider.",
      details: { provider, ownerProvided: Boolean(owner), repositoryProvided: Boolean(repository) },
    });
  }

  return {
    provider,
    owner,
    repository,
    visibility,
    dryRun: exportExecute ? false : true,
  };
}

function validateSignoffApprovers(value?: number): number | undefined {
  if (value === undefined) return undefined;
  if (value < 1) {
    throw new StratosphereError({
      code: "INPUT_INVALID",
      message: "signoff_required_approvers must be >= 1.",
      hint: "Use 1 or higher.",
      details: { value },
    });
  }
  return value;
}

function fail(error: unknown, fallbackCode: string, fallbackDetails?: Record<string, unknown>) {
  const payload = toErrorPayload(error);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            error: {
              code: payload.code ?? fallbackCode,
              message: payload.message,
              hint: payload.hint,
              details: {
                ...(fallbackDetails ?? {}),
                ...(payload.details ?? {}),
              },
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

function loadIntake(filePath?: string): BusinessIntake | undefined {
  if (!filePath) return undefined;
  return validateBusinessIntake(loadJsonFile(filePath, "intake"));
}

function loadWorkspace(filePath?: string): ApplicationWorkspace | undefined {
  if (!filePath) return undefined;
  return validateApplicationWorkspace(loadJsonFile(filePath, "workspace"));
}

server.tool(
  "generate_migration_bundle",
  "Generate a Stratosphere migration bundle from runtime snapshot input, SSH interrogation, or local VM discovery.",
  {
    runtime_file: z.string().optional().describe("Optional path to runtime snapshot JSON"),
    intake_file: z.string().optional().describe("Optional path to business intake JSON"),
    workspace_file: z.string().optional().describe("Optional path to application workspace JSON"),
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
      intake_file,
      workspace_file,
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
      const intakeFile = intake_file ? resolve(intake_file) : undefined;
      const workspaceFile = workspace_file ? resolve(workspace_file) : undefined;
      const outputDir = resolve(out_dir);
      const runtimeSnapshot = runtimeFile ? loadRuntimeSnapshot(runtimeFile) : undefined;
      const intake = loadIntake(intakeFile);
      const workspace = loadWorkspace(workspaceFile);
      const connection = buildConnection(ssh_host, ssh_user, ssh_port, ssh_key);
      const discoveryMode = local_discovery ? "local" : connection ? "ssh" : "snapshot";
      const signoffRequiredApprovers = validateSignoffApprovers(signoff_required_approvers);

      if (local_discovery && (ssh_host || ssh_user || ssh_port || ssh_key)) {
        throw new StratosphereError({
          code: "INPUT_CONFLICT",
          message: "local_discovery cannot be combined with ssh_host/ssh_user/ssh_port/ssh_key.",
          hint: "Use local_discovery alone or remove it and provide full SSH connection inputs.",
        });
      }

      if (!runtimeSnapshot && discoveryMode === "snapshot") {
        throw new StratosphereError({
          code: "INPUT_MISSING",
          message: "runtime_file is required unless local_discovery is true or ssh_host/ssh_user are provided.",
          hint: "Provide runtime_file, or set local_discovery=true, or provide ssh_host/ssh_user.",
          details: { runtime_file, local_discovery, ssh_host, ssh_user },
        });
      }

      const request: MigrationRunRequest = {
        migrationId: migration_id ?? runtimeSnapshot?.host.hostname ?? "live-vm-migration",
        runtimeSnapshot,
        outDir: outputDir,
        discoveryMode,
        initiatedBy: initiated_by,
        signoffRequiredApprovers,
        connection: local_discovery ? undefined : connection,
        intake,
        workspace,
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
                applicationMaps: {
                  currentStateSummary: result.applicationMaps.currentState.summary,
                  futureStateSummary: result.applicationMaps.futureState.summary,
                },
                intake: result.intake,
                workspace: result.workspace,
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
      return fail(error, "MIGRATION_GENERATION_FAILED", {
        runtime_file,
        intake_file,
        workspace_file,
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
    intake_file: z.string().optional().describe("Optional path to business intake JSON"),
    workspace_file: z.string().optional().describe("Optional path to application workspace JSON"),
    initiated_by: z.string().optional().describe("Operator name for audit trail"),
    signoff_required_approvers: z.number().optional().describe("Required number of approvers for sign-off"),
  },
  async ({ out_dir, migration_id, runtime_file, intake_file, workspace_file, initiated_by, signoff_required_approvers }) => {
    try {
      const outputDir = resolve(out_dir);
      const runtimeSnapshot = runtime_file ? loadRuntimeSnapshot(resolve(runtime_file)) : undefined;
      const intake = intake_file ? loadIntake(resolve(intake_file)) : undefined;
      const workspace = workspace_file ? loadWorkspace(resolve(workspace_file)) : undefined;
      const signoffRequiredApprovers = validateSignoffApprovers(signoff_required_approvers);

      const request: MigrationRunRequest = {
        migrationId: migration_id ?? runtimeSnapshot?.host.hostname ?? "local-vm-migration",
        runtimeSnapshot,
        outDir: outputDir,
        discoveryMode: "local",
        initiatedBy: initiated_by,
        signoffRequiredApprovers,
        intake,
        workspace,
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
                applicationMaps: {
                  currentStateSummary: result.applicationMaps.currentState.summary,
                  futureStateSummary: result.applicationMaps.futureState.summary,
                },
                intake: result.intake,
                workspace: result.workspace,
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
      return fail(error, "LOCAL_VM_GENERATION_FAILED", {
        out_dir,
        runtime_file,
        intake_file,
        workspace_file,
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
      return fail(error, "BUNDLE_VALIDATION_FAILED", { bundle_dir });
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
      const maps = buildApplicationMaps(preview.graph, discovery, preview.decomposition);

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
                applicationMaps: {
                  currentStateSummary: maps.currentState.summary,
                  futureStateSummary: maps.futureState.summary,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return fail(error, "DECOMPOSITION_PREVIEW_FAILED", { runtime_file });
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
