#!/usr/bin/env node
import { runCli } from "@stratosphere/cli";
import { toErrorPayload, toUserFacingError, sanitizeErrorDetails } from "@stratosphere/engine";
import { runMcpServer } from "@stratosphere/mcp";
import { pathToFileURL } from "node:url";
import { runDoctor } from "./doctor.js";

const VERSION = "0.1.0";

function printUsage(): void {
  console.log(`Stratosphere

Usage:
  stratosphere [cli flags]
  stratosphere doctor [--out-dir <path>] [--json]
  stratosphere mcp
  stratosphere version

Examples:
  stratosphere --runtime-file fixtures/stratosphere/sample-runtime.json --out-dir artifacts/my-migration
  stratosphere --local-discovery --out-dir artifacts/my-migration
  stratosphere doctor
  stratosphere mcp
`);
}

function printMcpUsage(): void {
  console.log(`Usage: stratosphere mcp

Starts the Stratosphere MCP server over stdio.
`);
}

function printTopLevelError(error: unknown, operation: string): void {
  const payload = toErrorPayload(error);
  const user = toUserFacingError(error, { operation });
  const details = sanitizeErrorDetails(payload.details);

  console.error("Stratosphere could not complete your request.");
  console.error(`Issue: ${user.title}`);
  console.error(`Code: ${payload.code}`);
  console.error(`What happened: ${user.message}`);
  console.error(`Guidance: ${user.hint}`);
  if (details) {
    console.error(`Details: ${JSON.stringify(details, null, 2)}`);
  }
}

function isHelpFlag(value: string): boolean {
  return value === "--help" || value === "-h" || value === "help";
}

export async function runStratosphere(argv: string[] = process.argv.slice(2)): Promise<number> {
  if (argv.length === 0) {
    printUsage();
    return 0;
  }

  const [command, ...rest] = argv;

  if (command === "version" || command === "--version" || command === "-v") {
    console.log(`stratosphere ${VERSION}`);
    return 0;
  }

  if (isHelpFlag(command)) {
    printUsage();
    return 0;
  }

  if (command === "doctor") {
    return runDoctor(rest);
  }

  if (command === "mcp") {
    if (rest.some(isHelpFlag)) {
      printMcpUsage();
      return 0;
    }
    await runMcpServer();
    return 0;
  }

  // Fall through to CLI mode for all migration flags.
  await runCli(argv);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStratosphere()
    .then((exitCode) => {
      if (exitCode !== 0) process.exit(exitCode);
    })
    .catch((error: unknown) => {
      printTopLevelError(error, "BINARY_RUN");
      process.exit(1);
    });
}
