import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import { StratosphereError } from "./errors.js";
import type {
  CommandExecutionResult,
  DiscoveryAdapter,
  DiscoveryRequest,
  DiscoveryResult,
  RuntimeConnection,
  RuntimeProcess,
  RuntimeSnapshot,
  ScheduledJob,
  StackType,
  VmConnection,
} from "./types.js";

const execFileAsync = promisify(execFile);
const SSH_COMMAND_TIMEOUT_MS = 15_000;
const COMMAND_SNIPPET_LIMIT = 4_000;

type DiscoveryCommand = {
  key:
    | "hostname"
    | "os-release"
    | "ip-brief"
    | "processes"
    | "listening-ports"
    | "cron"
    | "systemd-timers"
    | "connections"
    | "stateful-file-handles";
  command: string;
};

const SSH_DISCOVERY_COMMANDS: readonly DiscoveryCommand[] = [
  { key: "hostname", command: "hostname -f" },
  { key: "os-release", command: "cat /etc/os-release" },
  { key: "ip-brief", command: "ip -brief addr" },
  { key: "processes", command: "ps -eo pid,user,%cpu,rss,args --sort=-%cpu --no-headers" },
  { key: "listening-ports", command: "ss -lntupH" },
  { key: "cron", command: "crontab -l 2>/dev/null || true" },
  { key: "systemd-timers", command: "systemctl list-timers --all --no-pager --no-legend 2>/dev/null || true" },
  { key: "connections", command: "lsof -nP -iTCP -sTCP:ESTABLISHED 2>/dev/null || true" },
  {
    key: "stateful-file-handles",
    command:
      "lsof -nP +D /var/lib +D /data +D /srv 2>/dev/null | awk 'NR>1 {print $1\"\\t\"$2\"\\t\"$9}' || true",
  },
] as const;

type ExecutedCommand = {
  key: DiscoveryCommand["key"];
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

function clampSnippet(text: string): string {
  if (text.length <= COMMAND_SNIPPET_LIMIT) return text;
  return `${text.slice(0, COMMAND_SNIPPET_LIMIT)}\n...[truncated]`;
}

function cloneRuntime(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as RuntimeSnapshot;
}

function deriveProcessName(command: string): string {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "unknown";

  const executable = basename(tokens[0]);
  if (executable === "java") {
    const jarIndex = tokens.findIndex((token) => token === "-jar");
    if (jarIndex >= 0 && tokens[jarIndex + 1]) {
      return basename(tokens[jarIndex + 1]).replace(/\.jar$/i, "");
    }
  }

  if (executable === "dotnet" && tokens[1]) {
    return basename(tokens[1]).replace(/\.dll$/i, "");
  }

  return executable;
}

function parseHostname(output: string): string {
  const host = output.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return host ?? "unknown-host";
}

function parseOsRelease(output: string): { os: string; distro?: string } {
  const map = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (!match) continue;
    const value = match[2].replace(/^"|"$/g, "");
    map.set(match[1], value);
  }

  const distro = map.get("PRETTY_NAME") ?? map.get("NAME");
  return {
    os: distro?.toLowerCase().includes("linux") ? "linux" : "unknown",
    distro,
  };
}

function parseIpAddress(output: string): string | undefined {
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/\binet\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
    if (match) return match[1];
  }
  return undefined;
}

function parseProcesses(output: string): RuntimeProcess[] {
  const out: RuntimeProcess[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\d+)\s+(\S+)\s+([0-9.]+)\s+(\d+)\s+(.+)$/);
    if (!match) continue;

    const pid = Number.parseInt(match[1], 10);
    const user = match[2];
    const cpuPercent = Number.parseFloat(match[3]);
    const rssKb = Number.parseInt(match[4], 10);
    const command = match[5];

    out.push({
      pid,
      name: deriveProcessName(command),
      command,
      user,
      cpuPercent: Number.isFinite(cpuPercent) ? cpuPercent : 0,
      memoryMb: Math.max(1, Math.round(rssKb / 1024)),
      listeningPorts: [],
      fileWrites: [],
      envHints: {},
    });
  }

  return out;
}

function parseProcessSkeletonsFromLsof(output: string): RuntimeProcess[] {
  const out: RuntimeProcess[] = [];
  const seen = new Set<number>();

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("COMMAND")) continue;
    const match = trimmed.match(/^(\S+)\s+(\d+)\s+(\S+)/);
    if (!match) continue;

    const name = match[1];
    const pid = Number.parseInt(match[2], 10);
    const user = match[3];
    if (Number.isNaN(pid) || seen.has(pid)) continue;
    seen.add(pid);

    out.push({
      pid,
      name,
      command: name,
      user,
      cpuPercent: 0,
      memoryMb: 128,
      listeningPorts: [],
      fileWrites: [],
      envHints: {},
    });
  }

  return out;
}

function parseListeningPorts(output: string, processes: RuntimeProcess[]): void {
  const byPid = new Map(processes.map((process) => [process.pid, process]));
  const byName = new Map<string, RuntimeProcess[]>();

  for (const process of processes) {
    const list = byName.get(process.name);
    if (list) list.push(process);
    else byName.set(process.name, [process]);
  }

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const prefix = trimmed.split("users:(")[0]?.trim() ?? trimmed;
    const fields = prefix.split(/\s+/);
    const localAddress = fields[4] ?? "";
    const portMatch = localAddress.match(/:([0-9]+)$/);
    if (!portMatch) continue;

    const port = Number.parseInt(portMatch[1], 10);
    if (Number.isNaN(port)) continue;

    const usersPartMatch = trimmed.match(/users:\((.+)\)$/);
    const usersPart = usersPartMatch?.[1] ?? "";

    const pidMatches = [...usersPart.matchAll(/"([^"]+)",pid=(\d+)/g)];
    if (pidMatches.length > 0) {
      for (const match of pidMatches) {
        const pid = Number.parseInt(match[2], 10);
        const process = byPid.get(pid);
        if (!process) continue;
        if (!process.listeningPorts.includes(port)) process.listeningPorts.push(port);
      }
      continue;
    }

    for (const nameMatch of usersPart.matchAll(/"([^"]+)"/g)) {
      const candidates = byName.get(nameMatch[1]) ?? [];
      for (const process of candidates) {
        if (!process.listeningPorts.includes(port)) process.listeningPorts.push(port);
      }
    }
  }
}

function parseConnections(output: string): RuntimeConnection[] {
  const connections: RuntimeConnection[] = [];
  const seen = new Set<string>();

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("COMMAND")) continue;

    const fields = trimmed.split(/\s+/);
    const processName = fields[0];
    const endpoint = fields[fields.length - 1] ?? "";
    if (!endpoint.includes("->")) continue;

    const remote = endpoint.split("->")[1] ?? "";
    const remoteMatch = remote.match(/\[?([^\]]+)\]?:([0-9]+)$/);
    if (!remoteMatch) continue;

    const toHost = remoteMatch[1];
    const toPort = Number.parseInt(remoteMatch[2], 10);
    if (Number.isNaN(toPort)) continue;

    const key = `${processName}:${toHost}:${toPort}`;
    if (seen.has(key)) continue;
    seen.add(key);

    connections.push({
      processName,
      toHost,
      toPort,
      protocol: "tcp",
    });
  }

  return connections;
}

function parseCronEntries(output: string): ScheduledJob[] {
  const jobs: ScheduledJob[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/);
    if (!match) continue;

    const schedule = match[1];
    const command = match[2];
    jobs.push({
      name: deriveProcessName(command),
      schedule,
      command,
      source: "cron",
    });
  }

  return jobs;
}

function parseStatefulHandles(output: string, processes: RuntimeProcess[]): void {
  const byPid = new Map(processes.map((process) => [process.pid, process]));

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const [commandName, pidRaw, path] = trimmed.split(/\t+/);
    if (!pidRaw || !path) continue;

    const pid = Number.parseInt(pidRaw, 10);
    const process = byPid.get(pid) ?? processes.find((item) => item.name === commandName);
    if (!process) continue;
    if (!process.fileWrites.includes(path)) process.fileWrites.push(path);
  }
}

function detectStacks(processes: RuntimeProcess[]): StackType[] {
  const stacks = new Set<StackType>();

  for (const process of processes) {
    const command = process.command.toLowerCase();
    const name = process.name.toLowerCase();

    if (command.includes("java") || command.includes("spring") || command.includes(".jar")) {
      stacks.add("java-spring");
      continue;
    }

    if (command.includes("dotnet") || command.includes(".dll") || name.includes("dotnet")) {
      stacks.add("dotnet");
      continue;
    }

    if (command.includes("node") || command.includes("npm") || command.includes("yarn")) {
      stacks.add("nodejs");
      continue;
    }

    if (command.includes("python") || command.includes("gunicorn") || command.includes("uvicorn")) {
      stacks.add("python");
      continue;
    }
  }

  if (stacks.size === 0) stacks.add("unknown");
  return [...stacks];
}

function mergeFallbackSnapshot(primary: RuntimeSnapshot, fallback?: RuntimeSnapshot): RuntimeSnapshot {
  if (!fallback) return primary;

  const merged = cloneRuntime(primary);

  if (merged.host.hostname === "unknown-host" && fallback.host.hostname) {
    merged.host.hostname = fallback.host.hostname;
  }

  if (merged.host.os === "unknown" && fallback.host.os) {
    merged.host.os = fallback.host.os;
  }

  if (!merged.host.distro && fallback.host.distro) {
    merged.host.distro = fallback.host.distro;
  }

  if (!merged.host.ip && fallback.host.ip) {
    merged.host.ip = fallback.host.ip;
  }

  if (merged.processes.length === 0) {
    merged.processes = cloneRuntime(fallback).processes;
  }

  if (merged.connections.length === 0) {
    merged.connections = cloneRuntime(fallback).connections;
  }

  if (merged.scheduledJobs.length === 0) {
    merged.scheduledJobs = cloneRuntime(fallback).scheduledJobs;
  }

  if (!merged.source && fallback.source) {
    merged.source = cloneRuntime(fallback).source;
  }

  for (const process of merged.processes) {
    if (process.fileWrites.length > 0) continue;
    const fallbackProcess = fallback.processes.find((item) => item.name === process.name);
    if (!fallbackProcess) continue;
    process.fileWrites = [...fallbackProcess.fileWrites];
  }

  return merged;
}

async function runSshCommand(connection: VmConnection, command: DiscoveryCommand): Promise<ExecutedCommand> {
  const started = Date.now();
  const args = [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "ConnectTimeout=10",
    "-p",
    String(connection.port ?? 22),
  ];

  if (connection.privateKeyPath) {
    args.push("-i", connection.privateKeyPath);
  }

  args.push(`${connection.user}@${connection.host}`, "--", command.command);

  try {
    const { stdout, stderr } = await execFileAsync("ssh", args, {
      timeout: SSH_COMMAND_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    });

    return {
      key: command.key,
      command: command.command,
      stdout,
      stderr,
      exitCode: 0,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const err = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message?: string;
      killed?: boolean;
      signal?: string;
    };

    return {
      key: command.key,
      command: command.command,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "",
      exitCode: typeof err.code === "number" ? err.code : 255,
      durationMs: Date.now() - started,
    };
  }
}

async function runLocalCommand(command: DiscoveryCommand): Promise<ExecutedCommand> {
  const started = Date.now();

  try {
    const { stdout, stderr } = await execFileAsync("sh", ["-lc", command.command], {
      timeout: SSH_COMMAND_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    });

    return {
      key: command.key,
      command: command.command,
      stdout,
      stderr,
      exitCode: 0,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const err = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    return {
      key: command.key,
      command: command.command,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "",
      exitCode: typeof err.code === "number" ? err.code : 255,
      durationMs: Date.now() - started,
    };
  }
}

function toCommandResult(command: ExecutedCommand): CommandExecutionResult {
  return {
    command: command.command,
    exitCode: command.exitCode,
    stdoutSnippet: clampSnippet(command.stdout),
    stderrSnippet: clampSnippet(command.stderr),
    durationMs: command.durationMs,
  };
}

function buildRuntimeSnapshot(results: ExecutedCommand[]): RuntimeSnapshot {
  const byKey = new Map(results.map((item) => [item.key, item]));

  const hostname = parseHostname(byKey.get("hostname")?.stdout ?? "");
  const osDetails = parseOsRelease(byKey.get("os-release")?.stdout ?? "");
  const ip = parseIpAddress(byKey.get("ip-brief")?.stdout ?? "");

  let processes = parseProcesses(byKey.get("processes")?.stdout ?? "");
  if (processes.length === 0) {
    processes = parseProcessSkeletonsFromLsof(byKey.get("connections")?.stdout ?? "");
  }
  parseListeningPorts(byKey.get("listening-ports")?.stdout ?? "", processes);
  parseStatefulHandles(byKey.get("stateful-file-handles")?.stdout ?? "", processes);

  const connections = parseConnections(byKey.get("connections")?.stdout ?? "");
  const cronJobs = parseCronEntries(byKey.get("cron")?.stdout ?? "");

  return {
    host: {
      hostname,
      os: osDetails.os,
      distro: osDetails.distro,
      ip,
    },
    processes,
    connections,
    scheduledJobs: cronJobs,
    source: {
      repositoryPath: undefined,
      detectedStacks: detectStacks(processes),
      buildFiles: [],
    },
  };
}

export class SnapshotDiscoveryAdapter implements DiscoveryAdapter {
  readonly name = "snapshot";

  async collect(request: DiscoveryRequest): Promise<DiscoveryResult> {
    if (!request.runtimeSnapshot) {
      throw new StratosphereError({
        code: "INPUT_MISSING",
        message: "runtimeSnapshot is required for snapshot discovery mode.",
        hint: "Provide --runtime-file or switch to --local-discovery / SSH mode.",
        details: { mode: "snapshot" },
      });
    }

    return {
      runtime: cloneRuntime(request.runtimeSnapshot),
      evidence: {
        collector: this.name,
        commands: [],
        warnings: [],
        collectedAt: new Date().toISOString(),
        commandResults: [],
      },
    };
  }
}

export class SshDiscoveryAdapter implements DiscoveryAdapter {
  readonly name = "ssh-readonly";

  async collect(request: DiscoveryRequest): Promise<DiscoveryResult> {
    if (!request.connection) {
      throw new StratosphereError({
        code: "INPUT_MISSING",
        message: "SSH discovery requires connection details.",
        hint: "Provide ssh host and user or switch to snapshot/local discovery mode.",
        details: { mode: "ssh" },
      });
    }

    const commandRuns = await Promise.all(SSH_DISCOVERY_COMMANDS.map((command) => runSshCommand(request.connection!, command)));

    const warnings: string[] = [];
    const failed = commandRuns.filter((run) => run.exitCode !== 0);
    if (failed.length > 0) {
      warnings.push(`${failed.length} SSH discovery command(s) returned non-zero exit codes.`);
    }

    const parsedRuntime = buildRuntimeSnapshot(commandRuns);
    const mergedRuntime = mergeFallbackSnapshot(parsedRuntime, request.runtimeSnapshot);

    if (mergedRuntime.processes.length === 0) {
      throw new StratosphereError({
        code: "DISCOVERY_NO_PROCESS_DATA",
        message: "SSH discovery collected no process data.",
        hint: "Ensure the SSH user can run ps/ss/lsof, then retry. You can also provide a runtime snapshot as fallback.",
        details: { mode: "ssh", failedCommandCount: failed.length },
      });
    }

    return {
      runtime: mergedRuntime,
      evidence: {
        collector: this.name,
        commands: SSH_DISCOVERY_COMMANDS.map((command) => command.command),
        warnings,
        collectedAt: new Date().toISOString(),
        commandResults: commandRuns.map(toCommandResult),
      },
    };
  }
}

export class LocalDiscoveryAdapter implements DiscoveryAdapter {
  readonly name = "local-readonly";

  async collect(request: DiscoveryRequest): Promise<DiscoveryResult> {
    const commandRuns = await Promise.all(SSH_DISCOVERY_COMMANDS.map((command) => runLocalCommand(command)));

    const warnings: string[] = [];
    const failed = commandRuns.filter((run) => run.exitCode !== 0);
    if (failed.length > 0) {
      warnings.push(`${failed.length} local discovery command(s) returned non-zero exit codes.`);
    }

    const parsedRuntime = buildRuntimeSnapshot(commandRuns);
    const mergedRuntime = mergeFallbackSnapshot(parsedRuntime, request.runtimeSnapshot);

    if (mergedRuntime.processes.length === 0) {
      throw new StratosphereError({
        code: "DISCOVERY_NO_PROCESS_DATA",
        message: "Local discovery collected no process data.",
        hint: "Run with an account that can execute ps/ss/lsof or provide a runtime snapshot fallback file.",
        details: { mode: "local", failedCommandCount: failed.length },
      });
    }

    return {
      runtime: mergedRuntime,
      evidence: {
        collector: this.name,
        commands: SSH_DISCOVERY_COMMANDS.map((command) => command.command),
        warnings,
        collectedAt: new Date().toISOString(),
        commandResults: commandRuns.map(toCommandResult),
      },
    };
  }
}

export function getSshDiscoveryCommandSet(): readonly string[] {
  return SSH_DISCOVERY_COMMANDS.map((command) => command.command);
}
