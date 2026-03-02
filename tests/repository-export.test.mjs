import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { planRepositoryExport, runRepositoryExport } from "../packages/engine/dist/repository-export.js";
import { toErrorPayload } from "../packages/engine/dist/errors.js";

const bundle = {
  artifacts: [{ path: "a", content: "x" }, { path: "b", content: "y" }, { path: "c", content: "z" }],
};

test("planRepositoryExport returns undefined without request", () => {
  assert.equal(planRepositoryExport(bundle), undefined);
});

test("planRepositoryExport builds github actions", () => {
  const result = planRepositoryExport(bundle, {
    provider: "github",
    owner: "acme",
    repository: "stratosphere",
    dryRun: false,
  });

  assert.equal(result.provider, "github");
  assert.equal(result.dryRun, false);
  assert.equal(result.actions.length, 4);
  assert.equal(result.actions[0].status, "failed");
  assert.ok(result.actions.some((item) => item.description.includes("Open pull request")));
  assert.ok(result.warnings.some((item) => item.includes("Planned artifact file count: 3")));
  assert.equal(result.execution?.requested, true);
  assert.equal(result.execution?.executed, false);
});

test("planRepositoryExport builds gitlab dry-run actions by default", () => {
  const result = planRepositoryExport(bundle, {
    provider: "gitlab",
    owner: "acme",
    repository: "stratosphere",
  });

  assert.equal(result.provider, "gitlab");
  assert.equal(result.dryRun, true);
  assert.equal(result.actions.length, 4);
  assert.equal(result.actions[0].status, "planned");
  assert.ok(result.actions.some((item) => item.description.includes("Open merge request")));
  assert.equal(result.execution?.requested, false);
  assert.equal(result.execution?.executed, false);
});

test("planRepositoryExport allows execution when policy and token are set", () => {
  process.env.STRATOSPHERE_ENABLE_EXPORT_EXECUTION = "true";
  process.env.GITHUB_TOKEN = "token";

  const result = planRepositoryExport(bundle, {
    provider: "github",
    owner: "acme",
    repository: "stratosphere",
    branchName: "codex/ship-it",
    dryRun: false,
  });

  assert.equal(result.actions[0].status, "executed");
  assert.equal(result.execution?.requested, true);
  assert.equal(result.execution?.executed, true);
  assert.ok(result.execution?.reference?.includes("codex/ship-it"));

  delete process.env.STRATOSPHERE_ENABLE_EXPORT_EXECUTION;
  delete process.env.GITHUB_TOKEN;
});

test("planRepositoryExport handles unsupported providers defensively", () => {
  const result = planRepositoryExport(bundle, {
    provider: "bitbucket",
    owner: "acme",
    repository: "stratosphere",
  });

  assert.equal(result.provider, "bitbucket");
  assert.equal(result.actions.length, 0);
  assert.ok(result.warnings[0].includes("No exporter configured"));
  assert.equal(result.execution?.executed, false);
});

test("planRepositoryExport rejects invalid owner and branch inputs", () => {
  assert.throws(
    () =>
      planRepositoryExport(bundle, {
        provider: "github",
        owner: "acme org",
        repository: "stratosphere",
      }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_INVALID");
      return true;
    }
  );

  assert.throws(
    () =>
      planRepositoryExport(bundle, {
        provider: "github",
        owner: "acme",
        repository: "stratosphere",
        branchName: "bad branch",
      }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_INVALID");
      return true;
    }
  );
});

test("runRepositoryExport returns early when request is undefined", async () => {
  const result = await runRepositoryExport("/tmp", bundle, undefined);
  assert.equal(result, undefined);
});

test("runRepositoryExport handles unsupported provider without execution", async () => {
  const result = await runRepositoryExport("/tmp", bundle, {
    provider: "bitbucket",
    owner: "acme",
    repository: "stratosphere",
  });

  assert.equal(result.provider, "bitbucket");
  assert.equal(result.actions.length, 0);
  assert.equal(result.execution?.executed, false);
});

test("runRepositoryExport surfaces execution failure without leaking token values", async () => {
  process.env.STRATOSPHERE_ENABLE_EXPORT_EXECUTION = "true";
  process.env.GITHUB_TOKEN = "super-secret-value";

  const bundleDir = mkdtempSync(join(tmpdir(), "strat-export-fail-"));
  const result = await runRepositoryExport(bundleDir, bundle, {
    provider: "github",
    owner: "acme",
    repository: "stratosphere",
    dryRun: false,
    providerApiBaseUrl: "https://127.0.0.1:1",
  });

  assert.equal(result.execution?.requested, true);
  assert.equal(result.execution?.executed, false);
  assert.ok(result.execution?.reason);
  assert.equal(String(result.execution?.reason).includes("super-secret-value"), false);
  assert.ok(result.actions.every((item) => item.status === "failed"));

  delete process.env.STRATOSPHERE_ENABLE_EXPORT_EXECUTION;
  delete process.env.GITHUB_TOKEN;
  rmSync(bundleDir, { recursive: true, force: true });
});
