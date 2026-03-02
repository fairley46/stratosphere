import assert from "node:assert/strict";
import test from "node:test";
import {
  __discoveryTestables,
  getSshDiscoveryCommandSet,
  LocalDiscoveryAdapter,
  SnapshotDiscoveryAdapter,
  SshDiscoveryAdapter,
  toErrorPayload,
} from "../packages/engine/dist/index.js";

function commandRun(key, stdout, exitCode = 0, stderr = "") {
  return { key, command: key, stdout, stderr, exitCode, durationMs: 5 };
}

test("SnapshotDiscoveryAdapter enforces runtime snapshot input", async () => {
  const adapter = new SnapshotDiscoveryAdapter();
  await assert.rejects(
    () => adapter.collect({ migrationId: "m1", mode: "snapshot" }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_MISSING");
      return true;
    }
  );
});

test("SnapshotDiscoveryAdapter clones runtime payload", async () => {
  const adapter = new SnapshotDiscoveryAdapter();
  const runtimeSnapshot = {
    host: { hostname: "host-a", os: "linux", distro: "Rocky", ip: "10.0.0.2" },
    processes: [],
    connections: [],
    scheduledJobs: [],
    source: { detectedStacks: ["unknown"], buildFiles: [] },
  };
  const result = await adapter.collect({ migrationId: "m1", mode: "snapshot", runtimeSnapshot });
  result.runtime.host.hostname = "changed";
  assert.equal(runtimeSnapshot.host.hostname, "host-a");
});

test("buildRuntimeSnapshot parses process/network/cron and stack hints", () => {
  const results = [
    commandRun("hostname", "vm-a\n"),
    commandRun("os-release", 'NAME="Rocky Linux"\nPRETTY_NAME="Rocky Linux 9"\n'),
    commandRun("ip-brief", "2: eth0    inet 10.20.30.40/24 brd 10.20.30.255 scope global eth0"),
    commandRun(
      "processes",
      [
        "100 app 12.5 204800 java -jar /srv/billing.jar",
        "101 app 2.0 102400 dotnet Worker.dll",
        "102 app 1.0 4096 node index.js",
        "103 app 0.7 8192 python main.py",
      ].join("\n")
    ),
    commandRun(
      "listening-ports",
      [
        'tcp LISTEN 0 128 0.0.0.0:8080 users:("java",pid=100,fd=1)',
        'tcp LISTEN 0 128 0.0.0.0:9000 users:("python")',
      ].join("\n")
    ),
    commandRun(
      "connections",
      [
        "java 100 app TCP 10.1.1.1:8080->db.internal:5432",
        "java 100 app TCP 10.1.1.1:8080->db.internal:5432",
        "python 103 app TCP 10.1.1.1:9000->cache.internal:6379",
      ].join("\n")
    ),
    commandRun("cron", "# comment\n0 2 * * * /usr/bin/python main.py\n"),
    commandRun("stateful-file-handles", "java\t100\t/var/lib/billing/state.db\n"),
  ];

  const runtime = __discoveryTestables.buildRuntimeSnapshot(results);
  assert.equal(runtime.host.hostname, "vm-a");
  assert.equal(runtime.host.os, "linux");
  assert.equal(runtime.host.ip, "10.20.30.40");
  assert.equal(runtime.processes.length, 4);
  assert.deepEqual(runtime.processes.find((item) => item.pid === 100).listeningPorts, [8080]);
  assert.ok(runtime.processes.find((item) => item.pid === 103).listeningPorts.includes(9000));
  assert.ok(runtime.processes.find((item) => item.pid === 100).fileWrites.includes("/var/lib/billing/state.db"));
  assert.equal(runtime.connections.length, 2);
  assert.equal(runtime.scheduledJobs[0].name, "python");
  assert.ok(runtime.source.detectedStacks.includes("java-spring"));
  assert.ok(runtime.source.detectedStacks.includes("dotnet"));
  assert.ok(runtime.source.detectedStacks.includes("nodejs"));
  assert.ok(runtime.source.detectedStacks.includes("python"));
});

test("buildRuntimeSnapshot falls back to lsof process skeletons", () => {
  const runtime = __discoveryTestables.buildRuntimeSnapshot([
    commandRun("hostname", ""),
    commandRun("os-release", ""),
    commandRun("ip-brief", ""),
    commandRun("processes", ""),
    commandRun("listening-ports", ""),
    commandRun("connections", "python 333 app TCP 10.1.1.1:5000->db.internal:5432"),
    commandRun("cron", ""),
    commandRun("stateful-file-handles", ""),
  ]);

  assert.equal(runtime.host.hostname, "unknown-host");
  assert.equal(runtime.processes.length, 1);
  assert.equal(runtime.processes[0].name, "python");
  assert.equal(runtime.connections.length, 1);
});

test("mergeFallbackSnapshot fills unknown fields and process file writes", () => {
  const merged = __discoveryTestables.mergeFallbackSnapshot(
    {
      host: { hostname: "unknown-host", os: "unknown", distro: undefined, ip: undefined },
      processes: [{ pid: 1, name: "api", command: "api", user: "app", cpuPercent: 1, memoryMb: 1, listeningPorts: [], fileWrites: [], envHints: {} }],
      connections: [],
      scheduledJobs: [],
      source: undefined,
    },
    {
      host: { hostname: "vm-fallback", os: "linux", distro: "RHEL", ip: "10.0.0.9" },
      processes: [{ pid: 2, name: "api", command: "api", user: "app", cpuPercent: 2, memoryMb: 2, listeningPorts: [], fileWrites: ["/data/api.db"], envHints: {} }],
      connections: [{ processName: "api", toHost: "db", toPort: 5432, protocol: "tcp" }],
      scheduledJobs: [{ name: "job", schedule: "* * * * *", command: "api", source: "cron" }],
      source: { repositoryPath: "/repo", detectedStacks: ["nodejs"], buildFiles: ["package.json"] },
    }
  );

  assert.equal(merged.host.hostname, "vm-fallback");
  assert.equal(merged.host.os, "linux");
  assert.equal(merged.connections.length, 1);
  assert.equal(merged.scheduledJobs.length, 1);
  assert.equal(merged.source.repositoryPath, "/repo");
  assert.deepEqual(merged.processes[0].fileWrites, ["/data/api.db"]);
});

test("mergeFallbackSnapshot fully adopts fallback process lists when primary is empty", () => {
  const merged = __discoveryTestables.mergeFallbackSnapshot(
    {
      host: { hostname: "vm", os: "linux", distro: "x", ip: "1.1.1.1" },
      processes: [],
      connections: [],
      scheduledJobs: [],
      source: undefined,
    },
    {
      host: { hostname: "vm", os: "linux", distro: "x", ip: "1.1.1.1" },
      processes: [{ pid: 8, name: "api", command: "node api.js", user: "app", cpuPercent: 1, memoryMb: 64, listeningPorts: [], fileWrites: [], envHints: {} }],
      connections: [],
      scheduledJobs: [],
      source: undefined,
    }
  );
  assert.equal(merged.processes.length, 1);
});

test("toCommandResult and clampSnippet truncate long snippets", () => {
  const long = "x".repeat(5000);
  const result = __discoveryTestables.toCommandResult({
    key: "hostname",
    command: "hostname -f",
    stdout: long,
    stderr: long,
    exitCode: 0,
    durationMs: 10,
  });
  assert.ok(result.stdoutSnippet.includes("...[truncated]"));
  assert.ok(result.stderrSnippet.includes("...[truncated]"));
  assert.ok(__discoveryTestables.clampSnippet("ok").includes("ok"));
});

test("runLocalCommand supports success and failure paths", async () => {
  const ok = await __discoveryTestables.runLocalCommand({ key: "hostname", command: "printf 'ok'" });
  assert.equal(ok.exitCode, 0);
  assert.equal(ok.stdout, "ok");

  const bad = await __discoveryTestables.runLocalCommand({ key: "hostname", command: "command_that_does_not_exist_123" });
  assert.notEqual(bad.exitCode, 0);
  assert.ok(bad.stderr.length > 0);
});

test("runSshCommand returns structured failure metadata when SSH fails", async () => {
  const failed = await __discoveryTestables.runSshCommand(
    { host: "203.0.113.55", user: "nope", port: 1 },
    { key: "hostname", command: "hostname -f" }
  );
  assert.notEqual(failed.exitCode, 0);
  assert.equal(failed.key, "hostname");
});

test("runSshCommand supports success path and private key argument injection", async () => {
  let capturedArgs = [];
  const success = await __discoveryTestables.runSshCommand(
    { host: "vm.example", user: "readonly", port: 22, privateKeyPath: "/tmp/id_rsa" },
    { key: "hostname", command: "hostname -f" },
    async (_file, args) => {
      capturedArgs = args;
      return { stdout: "vm.example\n", stderr: "" };
    }
  );

  assert.equal(success.exitCode, 0);
  assert.equal(success.stdout.trim(), "vm.example");
  assert.ok(capturedArgs.includes("-i"));
  assert.ok(capturedArgs.includes("/tmp/id_rsa"));
});

test("SshDiscoveryAdapter supports injected runners and warnings", async () => {
  const outputs = new Map([
    ["hostname", commandRun("hostname", "vm-ssh\n")],
    ["os-release", commandRun("os-release", 'PRETTY_NAME="RHEL 9"\n')],
    ["ip-brief", commandRun("ip-brief", "eth0 UP 10.10.10.10/24")],
    ["processes", commandRun("processes", "200 app 1.0 1024 node api.js")],
    ["listening-ports", commandRun("listening-ports", 'tcp LISTEN 0 128 0.0.0.0:3000 users:("node",pid=200,fd=1)')],
    ["cron", commandRun("cron", "")],
    ["systemd-timers", commandRun("systemd-timers", "")],
    ["connections", commandRun("connections", "node 200 app TCP 10.0.0.1:3000->redis:6379")],
    ["stateful-file-handles", commandRun("stateful-file-handles", "", 1, "permission denied")],
  ]);
  const adapter = new SshDiscoveryAdapter(async (_connection, command) => outputs.get(command.key));
  const result = await adapter.collect({
    migrationId: "m1",
    mode: "ssh",
    connection: { host: "host", user: "user", port: 22 },
  });

  assert.equal(result.runtime.processes.length, 1);
  assert.equal(result.evidence.collector, "ssh-readonly");
  assert.ok(result.evidence.warnings[0].includes("non-zero"));
  assert.equal(result.evidence.commandResults.length, getSshDiscoveryCommandSet().length);
});

test("SshDiscoveryAdapter requires connection and process data", async () => {
  const adapter = new SshDiscoveryAdapter(async () => commandRun("hostname", ""));

  await assert.rejects(
    () => adapter.collect({ migrationId: "m1", mode: "ssh" }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_MISSING");
      return true;
    }
  );

  const emptyAdapter = new SshDiscoveryAdapter(async (connection, command) => {
    const _ = connection;
    if (command.key === "hostname") return commandRun(command.key, "");
    return commandRun(command.key, "");
  });

  await assert.rejects(
    () => emptyAdapter.collect({ migrationId: "m2", mode: "ssh", connection: { host: "x", user: "y" } }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "DISCOVERY_NO_PROCESS_DATA");
      return true;
    }
  );
});

test("LocalDiscoveryAdapter uses injected runner and validates process presence", async () => {
  const localAdapter = new LocalDiscoveryAdapter(async (command) => {
    if (command.key === "hostname") return commandRun(command.key, "vm-local");
    if (command.key === "processes") return commandRun(command.key, "300 app 2.0 2048 python app.py");
    if (command.key === "connections") return commandRun(command.key, "");
    if (command.key === "listening-ports") return commandRun(command.key, "");
    return commandRun(command.key, "");
  });
  const localResult = await localAdapter.collect({ migrationId: "m3", mode: "local" });
  assert.equal(localResult.runtime.processes.length, 1);
  assert.equal(localResult.evidence.collector, "local-readonly");

  const emptyLocal = new LocalDiscoveryAdapter(async (command) => commandRun(command.key, ""));
  await assert.rejects(
    () => emptyLocal.collect({ migrationId: "m4", mode: "local" }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "DISCOVERY_NO_PROCESS_DATA");
      return true;
    }
  );

  const warningLocal = new LocalDiscoveryAdapter(async (command) => {
    if (command.key === "processes") return commandRun(command.key, "300 app 2.0 2048 python app.py");
    if (command.key === "stateful-file-handles") return commandRun(command.key, "", 1, "denied");
    return commandRun(command.key, "");
  });
  const warningResult = await warningLocal.collect({ migrationId: "m5", mode: "local" });
  assert.ok(warningResult.evidence.warnings[0].includes("non-zero"));
});

test("getSshDiscoveryCommandSet returns read-only discovery command list", () => {
  const commands = getSshDiscoveryCommandSet();
  assert.ok(commands.length >= 8);
  assert.ok(commands.some((item) => item.includes("hostname -f")));
  assert.ok(commands.some((item) => item.includes("ps -eo")));
});
