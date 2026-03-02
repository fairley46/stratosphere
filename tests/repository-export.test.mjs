import assert from "node:assert/strict";
import test from "node:test";
import { planRepositoryExport } from "../packages/engine/dist/repository-export.js";

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
  assert.equal(result.actions[0].status, "skipped");
  assert.ok(result.actions.some((item) => item.description.includes("Open pull request")));
  assert.ok(result.warnings.some((item) => item.includes("Planned artifact file count: 3")));
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
});
