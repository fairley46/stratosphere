import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  StratosphereError,
  getSshDiscoveryCommandSet,
  runMigrationPipeline,
  summarizeRun,
  toErrorPayload,
  type DiscoveryMode,
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
    if (!token.startsWith("--")) {
      throw new StratosphereError({
        code: "INPUT_INVALID",
        message: `Unexpected positional argument: ${token}`,
        hint: "Use --help to view supported flags.",
      });
    }

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

  throw new StratosphereError({
    code: "INPUT_MISSING",
    message: `Missing required argument --${key}`,
    hint: "Provide the required flag and try again.",
    details: { key },
  });
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
    throw new StratosphereError({
      code: "INPUT_INVALID",
      message: `Invalid numeric argument for --${key}: ${raw}`,
      hint: "Provide an integer value.",
      details: { key, value: raw },
    });
  }

  return parsed;
}

function loadSnapshot(runtimeFile: string): RuntimeSnapshot {
  let raw: string;
  try {
    raw = readFileSync(runtimeFile, "utf8");
  } catch (error) {
    throw new StratosphereError({
      code: "FILE_READ_FAILED",
      message: `Unable to read runtime snapshot file: ${runtimeFile}`,
      hint: "Check that the file exists and is readable.",
      details: { runtimeFile, reason: String(error) },
    });
  }

  try {
    return JSON.parse(raw) as RuntimeSnapshot;
  } catch (error) {
    throw new StratosphereError({
      code: "JSON_PARSE_FAILED",
      message: `Invalid JSON in runtime snapshot file: ${runtimeFile}`,
      hint: "Validate JSON syntax and required fields.",
      details: { runtimeFile, reason: String(error) },
    });
  }
}

function parseConnection(args: ArgMap): VmConnection | undefined {
  const host = getOptionalString(args, "ssh-host");
  const user = getOptionalString(args, "ssh-user");

  if ((host && !user) || (!host && user)) {
    throw new StratosphereError({
      code: "INPUT_MISSING",
      message: "SSH mode requires both --ssh-host and --ssh-user.",
      hint: "Provide both flags or remove both to use snapshot/local mode.",
      details: { hostProvided: Boolean(host), userProvided: Boolean(user) },
    });
  }

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
  const owner = getOptionalString(args, "export-owner");
  const repository = getOptionalString(args, "export-repo");

  if (!provider && (owner || repository)) {
    throw new StratosphereError({
      code: "INPUT_MISSING",
      message: "--export-owner/--export-repo require --export-provider.",
      hint: "Add --export-provider github|gitlab or remove export owner/repo flags.",
    });
  }

  if (!provider) return undefined;

  if (provider !== "github" && provider !== "gitlab") {
    throw new StratosphereError({
      code: "INPUT_INVALID",
      message: `Unsupported export provider: ${provider}`,
      hint: "Use --export-provider github or --export-provider gitlab.",
    });
  }

  if (!owner || !repository) {
    throw new StratosphereError({
      code: "INPUT_MISSING",
      message: "Export provider requires --export-owner and --export-repo.",
      hint: "Provide owner and repository name for export planning.",
      details: { provider },
    });
  }

  const visibility = getOptionalString(args, "export-visibility");
  if (visibility && visibility !== "private" && visibility !== "internal" && visibility !== "public") {
    throw new StratosphereError({
      code: "INPUT_INVALID",
      message: `Invalid export visibility: ${visibility}`,
      hint: "Use one of: private, internal, public.",
    });
  }

  return {
    provider,
    owner,
    repository,
    visibility: visibility as "private" | "internal" | "public" | undefined,
    dryRun: getBool(args, "export-execute") ? false : true,
  };
}

function validateSignoffApprovers(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (value < 1) {
    throw new StratosphereError({
      code: "INPUT_INVALID",
      message: "--signoff-required-approvers must be >= 1.",
      hint: "Use 1 or higher.",
      details: { value },
    });
  }
  return value;
}

function resolveDiscoveryMode(args: ArgMap, connection: VmConnection | undefined): DiscoveryMode {
  const localDiscovery = getBool(args, "local-discovery");

  if (localDiscovery && connection) {
    throw new StratosphereError({
      code: "INPUT_CONFLICT",
      message: "--local-discovery cannot be combined with SSH connection flags.",
      hint: "Choose either local discovery or SSH discovery for this run.",
    });
  }

  if (localDiscovery) return "local";
  if (connection) return "ssh";
  return "snapshot";
}

function buildRequest(args: ArgMap): MigrationRunRequest {
  const connection = parseConnection(args);
  const discoveryMode = resolveDiscoveryMode(args, connection);

  const runtimeFileRaw = getOptionalString(args, "runtime-file");
  const runtimeFile = runtimeFileRaw ? resolve(INVOKE_CWD, runtimeFileRaw) : undefined;
  const runtimeSnapshot = runtimeFile ? loadSnapshot(runtimeFile) : undefined;

  if (!runtimeSnapshot && discoveryMode === "snapshot") {
    throw new StratosphereError({
      code: "INPUT_MISSING",
      message: "Snapshot mode requires --runtime-file.",
      hint: "Provide --runtime-file or use --local-discovery / SSH mode.",
    });
  }

  const signoffRequiredApprovers = validateSignoffApprovers(getOptionalNumber(args, "signoff-required-approvers"));

  const defaultMigrationId = runtimeFile
    ? basename(runtimeFile).replace(/\.json$/i, "")
    : discoveryMode === "local"
      ? "local-vm-migration"
      : "live-vm-migration";

  return {
    migrationId: getString(args, "migration-id", defaultMigrationId),
    runtimeSnapshot,
    outDir: resolve(INVOKE_CWD, getString(args, "out-dir", "artifacts/stratosphere")),
    discoveryMode,
    connection,
    initiatedBy: getOptionalString(args, "initiated-by"),
    signoffRequiredApprovers,
    exportRequest: parseExportRequest(args),
  };
}

function printUsage(): void {
  console.log(`Stratosphere CLI

Usage:
  npm run stratosphere -- --runtime-file fixtures/stratosphere/sample-runtime.json [--out-dir artifacts/stratosphere]
  npm run stratosphere -- --local-discovery [--out-dir artifacts/stratosphere]
  npm run stratosphere -- --ssh-host <host> --ssh-user <user> [--ssh-port <port>] [--out-dir artifacts/stratosphere]

Optional:
  --migration-id <id>
  --initiated-by <name>
  --signoff-required-approvers <n>
  --local-discovery
  --ssh-host <host> --ssh-user <user> [--ssh-port <port>] [--ssh-key <path>]
  --export-provider <github|gitlab> --export-owner <owner> --export-repo <repo> [--export-visibility <private|internal|public>] [--export-execute]
  --print-ssh-commands
`);
}

function printError(error: unknown): void {
  const payload = toErrorPayload(error);
  console.error("Stratosphere CLI failed.");
  console.error(`Code: ${payload.code}`);
  console.error(`Message: ${payload.message}`);
  if (payload.hint) console.error(`Hint: ${payload.hint}`);
  if (payload.details) console.error(`Details: ${JSON.stringify(payload.details, null, 2)}`);
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
  printError(error);
  printUsage();
  process.exit(1);
});
