import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  getSshDiscoveryCommandSet,
  runMigrationPipeline,
  summarizeRun,
  type MigrationRunRequest,
  type RuntimeSnapshot,
  type VmConnection,
} from "@stratosphere/engine";
import { z } from "zod";

const server = new McpServer({
  name: "stratosphere",
  version: "0.1.0",
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

server.tool(
  "generate_migration_bundle",
  "Generate a Stratosphere migration bundle from a VM runtime snapshot JSON file.",
  {
    runtime_file: z.string().describe("Path to runtime snapshot JSON"),
    out_dir: z.string().default("artifacts/stratosphere").describe("Output directory for generated bundle"),
    migration_id: z.string().optional().describe("Optional migration id override"),
    ssh_host: z.string().optional().describe("Optional SSH host metadata"),
    ssh_user: z.string().optional().describe("Optional SSH user metadata"),
    ssh_port: z.number().optional().describe("Optional SSH port metadata"),
    ssh_key: z.string().optional().describe("Optional SSH private key path metadata"),
  },
  async ({ runtime_file, out_dir, migration_id, ssh_host, ssh_user, ssh_port, ssh_key }) => {
    try {
      const runtimeFile = resolve(runtime_file);
      const outputDir = resolve(out_dir);
      const runtimeSnapshot = loadRuntimeSnapshot(runtimeFile);

      const request: MigrationRunRequest = {
        migrationId: migration_id ?? runtimeSnapshot.host.hostname,
        runtimeSnapshot,
        outDir: outputDir,
        connection: buildConnection(ssh_host, ssh_user, ssh_port, ssh_key),
      };

      const result = await runMigrationPipeline(request);

      const response = {
        migrationId: request.migrationId,
        outDir: outputDir,
        summary: summarizeRun(result),
        recommendations: result.decomposition.recommendations.map((item) => ({
          component: item.componentName,
          kind: item.kind,
          confidence: item.confidence,
          dependencies: item.dependencies,
        })),
        blockers: result.decomposition.blockers,
        validation: result.validation,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Stratosphere MCP failed: ${String(error)}`,
          },
        ],
        isError: true,
      };
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

const transport = new StdioServerTransport();
await server.connect(transport);
