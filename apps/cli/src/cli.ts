import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  getSshDiscoveryCommandSet,
  runMigrationPipeline,
  summarizeRun,
  type MigrationRunRequest,
  type RepositoryExportRequest,
  type RuntimeSnapshot,
  type VmConnection,
} from "@stratosphere/engine";

type ArgMap = Record<string, string | boolean>;
const INVOKE_CWD = process.env.INIT_CWD ?? process.cwd();

function parseArgs(argv: string[]): ArgMap {
  const out: ArgMap = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }

    out[key] = next;
    index += 1;
  }

  return out;
}

function getString(args: ArgMap, key: string, fallback?: string): string {
  const value = args[key];
  if (typeof value === "string") return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required arg --${key}`);
}

function getOptionalString(args: ArgMap, key: string): string | undefined {
  const value = args[key];
  if (typeof value === "string") return value;
  return undefined;
}

function getBool(args: ArgMap, key: string): boolean {
  const value = args[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return false;
}

function getOptionalNumber(args: ArgMap, key: string): number | undefined {
  const raw = getOptionalString(args, key);
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`--${key} must be a number`);
  }
  return parsed;
}

function loadSnapshot(runtimeFile: string): RuntimeSnapshot {
  const raw = readFileSync(runtimeFile, "utf8");
  return JSON.parse(raw) as RuntimeSnapshot;
}

function parseConnection(args: ArgMap): VmConnection | undefined {
  const host = getOptionalString(args, "ssh-host");
  const user = getOptionalString(args, "ssh-user");

  if (!host || !user) return undefined;

  const port = getOptionalNumber(args, "ssh-port");

  return {
    host,
    user,
    port,
    privateKeyPath: getOptionalString(args, "ssh-key"),
  };
}

function parseExportRequest(args: ArgMap): RepositoryExportRequest | undefined {
  const provider = getOptionalString(args, "export-provider");
  if (!provider) return undefined;

  if (provider !== "github" && provider !== "gitlab") {
    throw new Error("--export-provider must be one of: github, gitlab");
  }

  const owner = getString(args, "export-owner");
  const repository = getString(args, "export-repo");
  const visibility = getOptionalString(args, "export-visibility");

  if (visibility && visibility !== "private" && visibility !== "internal" && visibility !== "public") {
    throw new Error("--export-visibility must be one of: private, internal, public");
  }
  const validatedVisibility = visibility as "private" | "internal" | "public" | undefined;

  return {
    provider,
    owner,
    repository,
    visibility: validatedVisibility,
    dryRun: getBool(args, "export-execute") ? false : true,
  };
}

function buildRequest(args: ArgMap): MigrationRunRequest {
  const runtimeFile = resolve(INVOKE_CWD, getString(args, "runtime-file"));
  const runtimeSnapshot = loadSnapshot(runtimeFile);
  const defaultMigrationId = basename(runtimeFile).replace(/\.json$/i, "");

  return {
    migrationId: getString(args, "migration-id", defaultMigrationId),
    runtimeSnapshot,
    outDir: resolve(INVOKE_CWD, getString(args, "out-dir", "artifacts/stratosphere")),
    connection: parseConnection(args),
    initiatedBy: getOptionalString(args, "initiated-by"),
    signoffRequiredApprovers: getOptionalNumber(args, "signoff-required-approvers"),
    exportRequest: parseExportRequest(args),
  };
}

function printUsage(): void {
  console.log(`Stratosphere CLI

Usage:
  npm run stratosphere -- --runtime-file fixtures/stratosphere/sample-runtime.json [--out-dir artifacts/stratosphere]

Optional:
  --migration-id <id>
  --initiated-by <name>
  --signoff-required-approvers <n>
  --ssh-host <host> --ssh-user <user> [--ssh-port <port>] [--ssh-key <path>]
  --export-provider <github|gitlab> --export-owner <owner> --export-repo <repo> [--export-visibility <private|internal|public>] [--export-execute]
  --print-ssh-commands
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (getBool(args, "help")) {
    printUsage();
    return;
  }

  if (getBool(args, "print-ssh-commands")) {
    for (const command of getSshDiscoveryCommandSet()) {
      console.log(command);
    }
    return;
  }

  const request = buildRequest(args);
  const result = await runMigrationPipeline(request);

  console.log(`Migration package generated at ${request.outDir}`);
  console.log(summarizeRun(result));

  if (result.exportResult) {
    console.log(
      `repositoryExport provider=${result.exportResult.provider} dryRun=${result.exportResult.dryRun} actions=${result.exportResult.actions.length}`
    );
  }
}

main().catch((error: unknown) => {
  console.error(`Stratosphere CLI failed: ${String(error)}`);
  process.exit(1);
});
