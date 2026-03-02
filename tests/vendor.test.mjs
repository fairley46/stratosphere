import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectVendorDependencies } from "../packages/engine/dist/vendor.js";
import { detectSecrets, decomposeRuntime } from "../packages/engine/dist/decompose.js";
import { generateArtifacts, secretsManagementGuide } from "../packages/engine/dist/generate.js";
import { runMigrationPipeline } from "../packages/engine/dist/orchestrator.js";

function buildDiscovery(processes = [], connections = []) {
  return {
    runtime: {
      host: { hostname: "vm-vendor-test", os: "linux" },
      processes,
      connections,
      scheduledJobs: [],
    },
    evidence: {
      collector: "snapshot",
      commands: [],
      warnings: [],
      collectedAt: new Date().toISOString(),
      commandResults: [],
    },
  };
}

function proc(name, command, envHints = {}) {
  return {
    pid: Math.floor(Math.random() * 9000) + 1000,
    name,
    command,
    user: "app",
    cpuPercent: 5,
    memoryMb: 128,
    listeningPorts: [],
    fileWrites: [],
    envHints,
  };
}

test("detectVendorDependencies returns empty result for non-vendor workloads", () => {
  const discovery = buildDiscovery([
    proc("api", "java -jar api.jar"),
    proc("worker", "node worker.js"),
  ]);
  const result = detectVendorDependencies(discovery);
  assert.equal(result.detected.length, 0);
  assert.equal(result.advisoryOnly, false);
  assert.equal(result.notes.length, 0);
});

test("detectVendorDependencies detects Azure Service Bus from command", () => {
  const discovery = buildDiscovery([
    proc("bus-worker", "dotnet ServiceBusWorker.dll --endpoint servicebus.windows.net"),
  ]);
  const result = detectVendorDependencies(discovery);
  assert.ok(result.detected.length > 0);
  assert.ok(result.detected.some((d) => d.vendor === "Azure" && d.service === "Service Bus"));
  assert.equal(result.advisoryOnly, true);
  assert.ok(result.notes.length > 0);
  assert.ok(result.notes[0].includes("Azure"));
});

test("detectVendorDependencies detects AWS S3 from process command", () => {
  const discovery = buildDiscovery([
    proc("uploader", "node upload.js", { AWS_REGION: "us-east-1" }),
  ], [
    { processName: "uploader", toHost: "s3.amazonaws.com", toPort: 443, protocol: "tcp" },
  ]);
  const result = detectVendorDependencies(discovery);
  assert.ok(result.detected.some((d) => d.vendor === "AWS" && d.service === "S3"));
  assert.ok(result.advisoryOnly);
});

test("detectVendorDependencies detects GCP Firestore from connection host", () => {
  const discovery = buildDiscovery([
    proc("app", "node app.js"),
  ], [
    { processName: "app", toHost: "firestore.googleapis.com", toPort: 443, protocol: "tcp" },
  ]);
  const result = detectVendorDependencies(discovery);
  assert.ok(result.detected.some((d) => d.vendor === "GCP" && d.service === "Firestore"));
});

test("detectVendorDependencies detects Salesforce from connection host", () => {
  const discovery = buildDiscovery([
    proc("sync", "java -jar sfdc-sync.jar --host login.salesforce.com"),
  ]);
  const result = detectVendorDependencies(discovery);
  assert.ok(result.detected.some((d) => d.vendor === "Salesforce"));
});

test("detectVendorDependencies detects Oracle DB from command pattern", () => {
  const discovery = buildDiscovery([
    proc("dbproxy", "java -cp oracle.jdbc.OracleDriver -jar app.jar"),
  ]);
  const result = detectVendorDependencies(discovery);
  assert.ok(result.detected.some((d) => d.vendor === "Oracle"));
});

test("detectVendorDependencies detects SAP HANA from connection host", () => {
  const discovery = buildDiscovery([
    proc("hana-app", "node app.js"),
  ], [
    { processName: "hana-app", toHost: "mydb.hana.ondemand.com", toPort: 443, protocol: "tcp" },
  ]);
  const result = detectVendorDependencies(discovery);
  assert.ok(result.detected.some((d) => d.vendor === "SAP" && d.service === "HANA XS"));
});

test("detectVendorDependencies handles processes with no envHints", () => {
  const discovery = buildDiscovery([
    { pid: 1, name: "minimal", command: "bin/minimal", user: "app", cpuPercent: 1, memoryMb: 64, listeningPorts: [], fileWrites: [] },
  ]);
  const result = detectVendorDependencies(discovery);
  assert.equal(result.detected.length, 0);
});

// ── Secrets detection tests (decompose.detectSecrets) ──────────────────────

test("detectSecrets finds env var names matching sensitive patterns", () => {
  const processes = [
    {
      pid: 1,
      name: "api",
      command: "java -jar api.jar",
      user: "app",
      cpuPercent: 10,
      memoryMb: 256,
      listeningPorts: [8080],
      fileWrites: [],
      envHints: { DB_PASSWORD: "***", JWT_SECRET: "***", SMTP_API_KEY: "***", APP_NAME: "billing" },
    },
  ];
  const secrets = detectSecrets(processes);
  assert.ok(secrets.length >= 3);
  assert.ok(secrets.some((s) => s.envVarName === "DB_PASSWORD" && s.source === "env-pattern"));
  assert.ok(secrets.some((s) => s.envVarName === "JWT_SECRET"));
  assert.ok(secrets.some((s) => s.envVarName === "SMTP_API_KEY"));
  assert.ok(!secrets.some((s) => s.envVarName === "APP_NAME"));
});

test("detectSecrets finds credential file paths", () => {
  const processes = [
    {
      pid: 2,
      name: "worker",
      command: "node worker.js",
      user: "app",
      cpuPercent: 5,
      memoryMb: 128,
      listeningPorts: [],
      fileWrites: ["/run/secrets/db-creds", "/tmp/app.log"],
      envHints: {},
    },
  ];
  const secrets = detectSecrets(processes);
  assert.ok(secrets.some((s) => s.source === "file-path" && s.envVarName === "CREDENTIAL_FILE"));
});

test("detectSecrets deduplicates across multiple processes", () => {
  const processes = [
    { pid: 1, name: "api", command: "java api.jar", user: "app", cpuPercent: 5, memoryMb: 128, listeningPorts: [], fileWrites: [], envHints: { DB_PASSWORD: "x" } },
    { pid: 2, name: "worker", command: "java worker.jar", user: "app", cpuPercent: 2, memoryMb: 64, listeningPorts: [], fileWrites: [], envHints: { DB_PASSWORD: "x" } },
  ];
  const secrets = detectSecrets(processes);
  const passwords = secrets.filter((s) => s.envVarName === "DB_PASSWORD");
  assert.equal(passwords.length, 1);
});

test("detectSecrets returns empty array for clean processes", () => {
  const processes = [
    { pid: 1, name: "clean-api", command: "java clean.jar", user: "app", cpuPercent: 5, memoryMb: 128, listeningPorts: [], fileWrites: [], envHints: { APP_PORT: "8080" } },
  ];
  const secrets = detectSecrets(processes);
  assert.equal(secrets.length, 0);
});

test("detectSecrets finds secrets in command arguments (env-pattern from command)", () => {
  const processes = [
    {
      pid: 3,
      name: "launcher",
      command: "env DB_PASSWORD=super-secret SMTP_API_KEY=abc123 node app.js",
      user: "app",
      cpuPercent: 2,
      memoryMb: 64,
      listeningPorts: [],
      fileWrites: [],
      envHints: {},
    },
  ];
  const secrets = detectSecrets(processes);
  assert.ok(secrets.some((s) => s.envVarName === "DB_PASSWORD" && s.source === "env-pattern"));
  assert.ok(secrets.some((s) => s.envVarName === "SMTP_API_KEY" && s.source === "env-pattern"));
});

// ── secretsManagementGuide with detected secrets ──────────────────────────────

function makeRecommendation(name, secrets = []) {
  return {
    componentId: name.toLowerCase(),
    componentName: name,
    kind: "Deployment",
    stack: "nodejs",
    confidence: 0.9,
    rationale: [],
    imageTag: `${name}:latest`,
    ports: [8080],
    resourceRecommendation: { cpuRequestMillicores: 100, cpuLimitMillicores: 200, memoryRequestMb: 128, memoryLimitMb: 256 },
    dependencies: [],
    secrets,
  };
}

test("secretsManagementGuide generates provider patterns section when no secrets detected", () => {
  const guide = secretsManagementGuide([makeRecommendation("api")]);
  assert.ok(guide.includes("Secrets Management Guide"));
  assert.ok(guide.includes("No secrets were automatically detected"));
  assert.ok(guide.includes("Option 1: Kubernetes Secret"));
  assert.ok(guide.includes("Option 2: External Secrets Operator"));
  assert.ok(guide.includes("Option 3: Vault Agent Sidecar"));
});

test("secretsManagementGuide includes detected secrets table and before/after section", () => {
  const secrets = [
    { name: "DB_PASSWORD", envVarName: "DB_PASSWORD", source: "env-pattern", confidence: 0.9 },
    { name: "JWT_SECRET", envVarName: "JWT_SECRET", source: "env-pattern", confidence: 0.9 },
    { name: "creds", envVarName: "CREDENTIAL_FILE", source: "file-path", confidence: 0.6 },
  ];
  const recommendations = [makeRecommendation("billing-api", secrets)];
  const guide = secretsManagementGuide(recommendations);
  assert.ok(guide.includes("## Detected Secrets by Component"));
  assert.ok(guide.includes("### billing-api"));
  assert.ok(guide.includes("DB_PASSWORD"));
  assert.ok(guide.includes("JWT_SECRET"));
  assert.ok(guide.includes("Before / After"));
  assert.ok(guide.includes("Config file / credential file"));
});

// ── generateArtifacts with secrets populates valuesYaml and configTemplates ──

function buildDiscoveryWithSecrets() {
  return {
    runtime: {
      host: { hostname: "vm-sec", os: "linux" },
      processes: [
        {
          pid: 1,
          name: "app",
          command: "java -jar app.jar",
          user: "app",
          cpuPercent: 10,
          memoryMb: 256,
          listeningPorts: [8080],
          fileWrites: [],
          envHints: { DB_PASSWORD: "x", JWT_SECRET: "x" },
        },
      ],
      connections: [],
      scheduledJobs: [],
    },
    evidence: { collector: "snapshot", commands: [], warnings: [], collectedAt: new Date().toISOString(), commandResults: [] },
  };
}

test("generateArtifacts populates envSecret and secretKeys in values.yaml when secrets detected", () => {
  const discovery = buildDiscoveryWithSecrets();
  const decomposition = decomposeRuntime(discovery);
  const bundle = generateArtifacts("sec-test", discovery, decomposition);
  const byPath = new Map(bundle.artifacts.map((a) => [a.path, a.content]));
  const values = byPath.get("helm/values.yaml");
  assert.ok(values.includes("DB_PASSWORD") || values.includes("JWT_SECRET"));
  assert.ok(values.includes("secretKeys:"));
  const secretsGuide = byPath.get("reports/secrets-management.md");
  assert.ok(secretsGuide.includes("Secrets Management Guide"));
});

// ── orchestrator vendor detection produces specific blockers ──────────────────

test("runMigrationPipeline adds vendor-specific blockers when Azure SDK patterns detected", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "strat-vendor-blockers-"));
  const vendorSnapshot = {
    host: { hostname: "vm-azure", os: "linux", distro: "Ubuntu 22.04" },
    processes: [
      {
        pid: 1,
        name: "servicebus-worker",
        command: "dotnet ServiceBusWorker.dll --endpoint servicebus.windows.net",
        user: "app",
        cpuPercent: 10,
        memoryMb: 256,
        listeningPorts: [],
        fileWrites: [],
      },
    ],
    connections: [],
    scheduledJobs: [],
  };

  const result = await runMigrationPipeline({
    migrationId: "vendor-blocker-test",
    runtimeSnapshot: vendorSnapshot,
    outDir,
    strategy: "balanced",
  });

  assert.ok(result.decomposition.blockers.some((b) => b.includes("Azure") && b.includes("Service Bus")));
  assert.ok(result.decomposition.blockers.some((b) => b.includes("Advisory-only mode")));
  assert.ok(result.decomposition.vendorDetection?.detected.length > 0);
  rmSync(outDir, { recursive: true, force: true });
});
