import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  getSshDiscoveryCommandSet,
  runMigrationPipeline,
  summarizeRun,
  type MigrationRunRequest,
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

function loadSnapshot(runtimeFile: string): RuntimeSnapshot {
  const raw = readFileSync(runtimeFile, "utf8");
  return JSON.parse(raw) as RuntimeSnapshot;
}

function parseConnection(args: ArgMap): VmConnection | undefined {
  const host = getOptionalString(args, "ssh-host");
  const user = getOptionalString(args, "ssh-user");

  if (!host || !user) return undefined;

  const portRaw = getOptionalString(args, "ssh-port");
  const port = portRaw ? Number.parseInt(portRaw, 10) : undefined;
  if (portRaw && Number.isNaN(port)) {
    throw new Error("--ssh-port must be a number");
  }

  return {
    host,
    user,
    port,
    privateKeyPath: getOptionalString(args, "ssh-key"),
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
  };
}

function printUsage(): void {
  console.log(`Stratosphere CLI

Usage:
  npm run stratosphere -- --runtime-file fixtures/stratosphere/sample-runtime.json [--out-dir artifacts/stratosphere]

Optional:
  --migration-id <id>
  --ssh-host <host> --ssh-user <user> [--ssh-port <port>] [--ssh-key <path>]
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
}

main().catch((error: unknown) => {
  console.error(`Stratosphere CLI failed: ${String(error)}`);
  process.exit(1);
});
