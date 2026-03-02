import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Check = {
  command: string;
  required: boolean;
  reason: string;
  installHint?: string;
};

type CheckResult = {
  command: string;
  required: boolean;
  reason: string;
  available: boolean;
  resolvedPath?: string;
  installHint?: string;
};

const INVOKE_CWD = process.env.INIT_CWD ?? process.cwd();

const CHECKS: readonly Check[] = [
  { command: "sh", required: true, reason: "Run read-only discovery command shell." },
  { command: "hostname", required: true, reason: "Collect host identity." },
  { command: "cat", required: true, reason: "Read OS release metadata." },
  { command: "ps", required: true, reason: "Collect process inventory.", installHint: "Install package: procps-ng" },
  { command: "ip", required: true, reason: "Collect host network interfaces.", installHint: "Install package: iproute" },
  { command: "ss", required: true, reason: "Collect listening port metadata.", installHint: "Install package: iproute" },
  { command: "lsof", required: false, reason: "Improve connection and stateful-file evidence.", installHint: "Install package: lsof" },
  { command: "systemctl", required: false, reason: "Collect scheduled timer metadata (optional)." },
  { command: "crontab", required: false, reason: "Collect cron metadata (optional).", installHint: "Install package: cronie" },
  { command: "ssh", required: false, reason: "Enable SSH discovery mode.", installHint: "Install package: openssh-clients" },
  { command: "git", required: false, reason: "Enable repository export execution.", installHint: "Install package: git" },
] as const;

function findExecutable(command: string): string | undefined {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], { encoding: "utf8" });
  if (result.status !== 0) return undefined;
  const path = result.stdout.trim();
  return path.length > 0 ? path : undefined;
}

function nearestExistingDirectory(path: string): string {
  let current = path;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function writableProbe(path: string): { writable: boolean; checkedPath: string; reason?: string } {
  const absolute = resolve(INVOKE_CWD, path);
  const target = nearestExistingDirectory(absolute);
  try {
    accessSync(target, constants.W_OK);
    return { writable: true, checkedPath: target };
  } catch (error) {
    return {
      writable: false,
      checkedPath: target,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function runChecks(): CheckResult[] {
  return CHECKS.map((check) => {
    const resolvedPath = findExecutable(check.command);
    return {
      command: check.command,
      required: check.required,
      reason: check.reason,
      available: Boolean(resolvedPath),
      resolvedPath,
      installHint: check.installHint,
    };
  });
}

function printTextReport(results: CheckResult[], outDir: string, writable: { writable: boolean; checkedPath: string; reason?: string }): void {
  const missingRequired = results.filter((result) => result.required && !result.available);
  const missingOptional = results.filter((result) => !result.required && !result.available);

  console.log("Stratosphere Doctor");
  console.log("");
  console.log(`Platform: ${process.platform}/${process.arch}`);
  console.log(`Output directory (requested): ${resolve(INVOKE_CWD, outDir)}`);
  console.log(`Writable probe path: ${writable.checkedPath}`);
  console.log(`Writable: ${writable.writable ? "yes" : "no"}`);
  if (!writable.writable && writable.reason) {
    console.log(`Writable check reason: ${writable.reason}`);
  }
  console.log("");
  console.log("Command checks:");
  for (const result of results) {
    const status = result.available ? "[ok]" : result.required ? "[missing-required]" : "[missing-optional]";
    const path = result.resolvedPath ? ` (${result.resolvedPath})` : "";
    console.log(`- ${status} ${result.command}${path}`);
    console.log(`  reason: ${result.reason}`);
    if (!result.available && result.installHint) {
      console.log(`  hint: ${result.installHint}`);
    }
  }
  console.log("");
  console.log(`Missing required commands: ${missingRequired.length}`);
  console.log(`Missing optional commands: ${missingOptional.length}`);
  if (missingRequired.length > 0) {
    console.log("Doctor status: FAILED");
    console.log("Next step: install required commands, then rerun `stratosphere doctor`.");
    return;
  }
  if (!writable.writable) {
    console.log("Doctor status: FAILED");
    console.log("Next step: choose an output directory in a writable path.");
    return;
  }
  console.log("Doctor status: PASS");
}

function parseDoctorArgs(argv: string[]): { json: boolean; outDir: string } {
  let json = false;
  let outDir = "artifacts/stratosphere";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--out-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("Missing value for --out-dir.");
      }
      outDir = next;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      throw new Error("USAGE");
    }
    throw new Error(`Unsupported doctor argument: ${arg}`);
  }

  return { json, outDir };
}

function printDoctorUsage(): void {
  console.log("Usage: stratosphere doctor [--out-dir <path>] [--json]");
}

export async function runDoctor(argv: string[] = []): Promise<number> {
  let parsed: { json: boolean; outDir: string };
  try {
    parsed = parseDoctorArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== "USAGE") {
      console.error(message);
    }
    printDoctorUsage();
    return 1;
  }

  const results = runChecks();
  const writable = writableProbe(parsed.outDir);
  const missingRequired = results.filter((result) => result.required && !result.available);
  const exitCode = missingRequired.length > 0 || !writable.writable ? 1 : 0;

  if (parsed.json) {
    console.log(
      JSON.stringify(
        {
          status: exitCode === 0 ? "pass" : "fail",
          platform: process.platform,
          arch: process.arch,
          outputDirectory: resolve(INVOKE_CWD, parsed.outDir),
          writableProbe: writable,
          checks: results,
          missingRequired: missingRequired.map((item) => item.command),
        },
        null,
        2
      )
    );
    return exitCode;
  }

  printTextReport(results, parsed.outDir, writable);
  return exitCode;
}
