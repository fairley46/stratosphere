import assert from "node:assert/strict";
import test from "node:test";
import { runChecksWithClients, runClusterPreflightChecks } from "../packages/engine/dist/preflight.js";

// ── Mock API clients ──────────────────────────────────────────────────────────

function makeMockCoreV1({ nodeCount = 1, namespaceExists = true, quotaCount = 0, secretCount = 0, pullSecretCount = 0 } = {}) {
  return {
    listNode: async () => ({ body: { items: Array.from({ length: nodeCount }, (_, i) => ({ metadata: { name: `node-${i}` } })) } }),
    readNamespace: async (name) => {
      if (!namespaceExists) throw new Error(`404: namespace "${name}" not found`);
      return { body: { metadata: { name } } };
    },
    listNamespacedResourceQuota: async () => ({ body: { items: Array.from({ length: quotaCount }, () => ({})) } }),
    listNamespacedSecret: async () => ({
      body: {
        items: [
          ...Array.from({ length: pullSecretCount }, (_, i) => ({
            type: "kubernetes.io/dockerconfigjson",
            metadata: { name: `pull-secret-${i}` },
          })),
          ...Array.from({ length: secretCount }, (_, i) => ({
            type: "Opaque",
            metadata: { name: `secret-${i}` },
          })),
        ],
      },
    }),
  };
}

function makeMockStorageV1({ classNames = ["standard"] } = {}) {
  return {
    listStorageClass: async () => ({
      body: { items: classNames.map((name) => ({ metadata: { name } })) },
    }),
  };
}

// ── runChecksWithClients tests ────────────────────────────────────────────────

test("runChecksWithClients returns 5 passed checks with healthy mock cluster", async () => {
  const coreV1 = makeMockCoreV1({ nodeCount: 3, namespaceExists: true, pullSecretCount: 1 });
  const storageV1 = makeMockStorageV1({ classNames: ["standard", "fast-ssd"] });
  const checks = await runChecksWithClients(coreV1, storageV1, { namespace: "test-ns" });
  assert.equal(checks.length, 5);
  assert.ok(checks.every((c) => c.passed), `Expected all passed; failures: ${checks.filter((c) => !c.passed).map((c) => c.message).join(", ")}`);
  assert.ok(checks.some((c) => c.id === "k8s-connectivity"));
  assert.ok(checks.some((c) => c.id === "k8s-namespace"));
  assert.ok(checks.some((c) => c.id === "k8s-resource-quota"));
  assert.ok(checks.some((c) => c.id === "k8s-storage-class"));
  assert.ok(checks.some((c) => c.id === "k8s-image-pull-secret"));
});

test("runChecksWithClients returns namespace fail when namespace missing", async () => {
  const coreV1 = makeMockCoreV1({ namespaceExists: false });
  const storageV1 = makeMockStorageV1();
  const checks = await runChecksWithClients(coreV1, storageV1, { namespace: "missing-ns" });
  const nsCheck = checks.find((c) => c.id === "k8s-namespace");
  assert.ok(nsCheck);
  assert.equal(nsCheck.passed, false);
  assert.ok(nsCheck.message.includes("missing-ns"));
});

test("runChecksWithClients passes resource quota check when no quotas exist", async () => {
  const coreV1 = makeMockCoreV1({ quotaCount: 0 });
  const storageV1 = makeMockStorageV1();
  const checks = await runChecksWithClients(coreV1, storageV1, { namespace: "test-ns" });
  const quotaCheck = checks.find((c) => c.id === "k8s-resource-quota");
  assert.ok(quotaCheck?.passed);
  assert.ok(quotaCheck?.message.includes("unrestricted"));
});

test("runChecksWithClients passes resource quota check when quotas present", async () => {
  const coreV1 = makeMockCoreV1({ quotaCount: 2 });
  const storageV1 = makeMockStorageV1();
  const checks = await runChecksWithClients(coreV1, storageV1, { namespace: "test-ns" });
  const quotaCheck = checks.find((c) => c.id === "k8s-resource-quota");
  assert.ok(quotaCheck?.passed);
});

test("runChecksWithClients storage class check passes when required class found", async () => {
  const coreV1 = makeMockCoreV1();
  const storageV1 = makeMockStorageV1({ classNames: ["fast-ssd", "standard"] });
  const checks = await runChecksWithClients(coreV1, storageV1, { namespace: "test-ns", requiredStorageClass: "fast-ssd" });
  const scCheck = checks.find((c) => c.id === "k8s-storage-class");
  assert.ok(scCheck?.passed);
  assert.ok(scCheck?.message.includes("fast-ssd"));
});

test("runChecksWithClients storage class check fails when required class missing", async () => {
  const coreV1 = makeMockCoreV1();
  const storageV1 = makeMockStorageV1({ classNames: ["standard"] });
  const checks = await runChecksWithClients(coreV1, storageV1, { namespace: "test-ns", requiredStorageClass: "premium-io" });
  const scCheck = checks.find((c) => c.id === "k8s-storage-class");
  assert.ok(scCheck);
  assert.equal(scCheck.passed, false);
  assert.ok(scCheck.message.includes("premium-io"));
});

test("runChecksWithClients storage class check passes when no required class specified and classes available", async () => {
  const coreV1 = makeMockCoreV1();
  const storageV1 = makeMockStorageV1({ classNames: ["standard"] });
  const checks = await runChecksWithClients(coreV1, storageV1, { namespace: "test-ns" });
  const scCheck = checks.find((c) => c.id === "k8s-storage-class");
  assert.ok(scCheck?.passed);
});

test("runChecksWithClients image pull secret check notes pull secrets found", async () => {
  const coreV1 = makeMockCoreV1({ pullSecretCount: 2 });
  const storageV1 = makeMockStorageV1();
  const checks = await runChecksWithClients(coreV1, storageV1, { namespace: "test-ns" });
  const secretCheck = checks.find((c) => c.id === "k8s-image-pull-secret");
  assert.ok(secretCheck?.passed);
  assert.ok(secretCheck?.message.includes("2 pull secret(s)"));
});

test("runChecksWithClients image pull secret check passes with note when no pull secrets", async () => {
  const coreV1 = makeMockCoreV1({ pullSecretCount: 0 });
  const storageV1 = makeMockStorageV1();
  const checks = await runChecksWithClients(coreV1, storageV1, { namespace: "test-ns" });
  const secretCheck = checks.find((c) => c.id === "k8s-image-pull-secret");
  assert.ok(secretCheck?.passed);
  assert.ok(secretCheck?.message.includes("private registries"));
});

test("runChecksWithClients namespace check fails with generic error (non-404)", async () => {
  const errorCoreV1 = {
    listNode: async () => ({ body: { items: [{}] } }),
    readNamespace: async () => { throw new Error("403: Forbidden - RBAC policy denied"); },
    listNamespacedResourceQuota: async () => ({ body: { items: [] } }),
    listNamespacedSecret: async () => ({ body: { items: [] } }),
  };
  const storageV1 = makeMockStorageV1();
  const checks = await runChecksWithClients(errorCoreV1, storageV1, { namespace: "restricted-ns" });
  const nsCheck = checks.find((c) => c.id === "k8s-namespace");
  assert.ok(nsCheck);
  assert.equal(nsCheck.passed, false);
  assert.ok(nsCheck.message.includes("Namespace check failed"));
});

test("runChecksWithClients returns direct response body when no body wrapper present (v1.x style)", async () => {
  // Test the unwrap() function's direct-return path (when API returns without body wrapper)
  const coreV1 = {
    listNode: async () => ({ items: [{ metadata: { name: "node-0" } }] }),
    readNamespace: async (name) => ({ metadata: { name } }),
    listNamespacedResourceQuota: async () => ({ items: [] }),
    listNamespacedSecret: async () => ({ items: [] }),
  };
  const storageV1 = {
    listStorageClass: async () => ({ items: [{ metadata: { name: "standard" } }] }),
  };
  const checks = await runChecksWithClients(coreV1, storageV1, { namespace: "test-ns" });
  assert.equal(checks.length, 5);
  assert.ok(checks.every((c) => c.passed));
});

test("runChecksWithClients handles API errors gracefully returning failed checks", async () => {
  const errorCoreV1 = {
    listNode: async () => { throw new Error("ECONNREFUSED"); },
    readNamespace: async () => { throw new Error("404: not found"); },
    listNamespacedResourceQuota: async () => { throw new Error("403: forbidden"); },
    listNamespacedSecret: async () => { throw new Error("503: unavailable"); },
  };
  const errorStorageV1 = {
    listStorageClass: async () => { throw new Error("ETIMEDOUT"); },
  };
  const checks = await runChecksWithClients(errorCoreV1, errorStorageV1, { namespace: "test-ns" });
  assert.equal(checks.length, 5);
  assert.ok(checks.some((c) => c.id === "k8s-connectivity" && !c.passed));
});

// ── runClusterPreflightChecks integration tests ───────────────────────────────

const VALID_KUBECONFIG = `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://localhost:19999
    insecure-skip-tls-verify: true
  name: test-cluster
contexts:
- context:
    cluster: test-cluster
    user: test-user
  name: test-context
current-context: test-context
users:
- name: test-user
  user:
    token: fake-test-token
`;

test("runClusterPreflightChecks returns failed checks for invalid kubeconfig path", async () => {
  const checks = await runClusterPreflightChecks({
    kubeconfig: "/nonexistent/path/kubeconfig.yaml",
    namespace: "test-ns",
  });
  assert.equal(checks.length, 5);
  assert.ok(checks.every((c) => !c.passed));
  assert.ok(checks[0].message.includes("failed") || checks[0].message.includes("unavailable") || checks[0].message.includes("load"));
});

test("runClusterPreflightChecks returns failed checks for malformed kubeconfig string", async () => {
  const checks = await runClusterPreflightChecks({
    kubeconfig: "{ not valid yaml: kubeconfig: data }",
    namespace: "test-ns",
  });
  assert.equal(checks.length, 5);
  assert.ok(checks[0].id === "k8s-connectivity");
});

test("runClusterPreflightChecks with valid kubeconfig YAML format attempts cluster connection and returns failed checks", async () => {
  // Uses a valid kubeconfig format pointing to a non-existent server (port 19999).
  // This covers the successful kubeconfig load path; API calls fail with connection error.
  const checks = await runClusterPreflightChecks({
    kubeconfig: VALID_KUBECONFIG,
    namespace: "test-ns",
    kubeContext: "test-context",
  });
  assert.equal(checks.length, 5);
  // Connectivity should fail (server not listening)
  const connectCheck = checks.find((c) => c.id === "k8s-connectivity");
  assert.ok(connectCheck);
  assert.equal(connectCheck.passed, false);
});

test("runClusterPreflightChecks with valid kubeconfig loads and attempts checks with custom resource limits", async () => {
  const checks = await runClusterPreflightChecks({
    kubeconfig: VALID_KUBECONFIG,
    namespace: "production",
    requiredStorageClass: "fast-ssd",
    totalCpuMillicores: 2000,
    totalMemoryMb: 4096,
  });
  assert.equal(checks.length, 5);
  assert.ok(checks.every((c) => c.id !== undefined));
});

// ── execution-workflow kubeconfig integration tests ───────────────────────────

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  initExecutionWorkflow,
  registerExecutionApproval,
  runExecutionPreflight,
  submitExecutionReview,
} from "../packages/engine/dist/execution-workflow.js";

function prepBundleWithKube(label = "strat-kube-") {
  const dir = mkdtempSync(join(tmpdir(), label));
  mkdirSync(join(dir, "reports"), { recursive: true });
  writeFileSync(
    join(dir, "reports/migration-summary.json"),
    JSON.stringify({ workloadCount: 2, blockers: [], validation: { findings: [] }, strategy: "balanced" }),
    "utf8"
  );
  writeFileSync(join(dir, "reports/readiness.json"), JSON.stringify({ score: 85 }), "utf8");
  return dir;
}

test("runExecutionPreflight with kubeconfig set but no cluster-preflight.json returns advisory pass", () => {
  const bundleDir = prepBundleWithKube("strat-kube-nofile-");
  initExecutionWorkflow({
    migrationId: "kube-test",
    bundleDir,
    targetEnvironment: "staging",
    kubeconfig: "/etc/kubeconfig.yaml",
    kubeContext: "staging-ctx",
    kubeNamespace: "migration-ns",
  });
  submitExecutionReview({ bundleDir, by: "reviewer", decision: "accept", notes: "ok" });
  registerExecutionApproval({ bundleDir, by: "approver-1" });
  registerExecutionApproval({ bundleDir, by: "approver-2" });

  const preflight = runExecutionPreflight({ bundleDir });
  assert.equal(preflight.state, "EXECUTION_READY");
  const clusterCheck = preflight.preflightChecks.find((c) => c.id === "k8s-cluster");
  assert.ok(clusterCheck?.passed);
  assert.ok(clusterCheck?.message.includes("runClusterPreflightChecks"));
  rmSync(bundleDir, { recursive: true, force: true });
});

test("runExecutionPreflight with cached cluster-preflight.json includes those checks", () => {
  const bundleDir = prepBundleWithKube("strat-kube-cached-");
  initExecutionWorkflow({
    migrationId: "kube-cached",
    bundleDir,
    targetEnvironment: "prod",
    kubeconfig: "/etc/kubeconfig.yaml",
  });
  submitExecutionReview({ bundleDir, by: "reviewer", decision: "accept", notes: "ok" });
  registerExecutionApproval({ bundleDir, by: "approver-1" });
  registerExecutionApproval({ bundleDir, by: "approver-2" });

  const clusterChecks = [
    { id: "k8s-connectivity", title: "K8s connectivity", passed: true, message: "API reachable." },
    { id: "k8s-namespace", title: "Target namespace", passed: true, message: "Namespace ready." },
  ];
  writeFileSync(join(bundleDir, "reports/cluster-preflight.json"), JSON.stringify(clusterChecks), "utf8");

  const preflight = runExecutionPreflight({ bundleDir });
  assert.equal(preflight.state, "EXECUTION_READY");
  assert.ok(preflight.preflightChecks.some((c) => c.id === "k8s-connectivity" && c.passed));
  rmSync(bundleDir, { recursive: true, force: true });
});

test("runExecutionPreflight with malformed cluster-preflight.json returns failed check", () => {
  const bundleDir = prepBundleWithKube("strat-kube-malformed-");
  initExecutionWorkflow({
    migrationId: "kube-malformed",
    bundleDir,
    targetEnvironment: "prod",
    kubeconfig: "/etc/kubeconfig.yaml",
  });
  submitExecutionReview({ bundleDir, by: "reviewer", decision: "accept", notes: "ok" });
  registerExecutionApproval({ bundleDir, by: "approver-1" });
  registerExecutionApproval({ bundleDir, by: "approver-2" });
  writeFileSync(join(bundleDir, "reports/cluster-preflight.json"), "{ malformed json", "utf8");

  const preflight = runExecutionPreflight({ bundleDir });
  assert.equal(preflight.state, "FAILED");
  assert.ok(preflight.preflightChecks.some((c) => c.id === "k8s-cluster" && !c.passed));
  rmSync(bundleDir, { recursive: true, force: true });
});
