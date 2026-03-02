import assert from "node:assert/strict";
import test from "node:test";
import {
  StratosphereError,
  runMigrationPipeline,
  sanitizeErrorDetails,
  toErrorPayload,
  toUserFacingError,
} from "../packages/engine/dist/index.js";

test("toErrorPayload preserves structured StratosphereError fields", () => {
  const error = new StratosphereError({
    code: "INPUT_INVALID",
    message: "Bad input",
    hint: "Use valid input",
    details: { field: "runtime_file" },
  });

  const payload = toErrorPayload(error);
  assert.equal(payload.code, "INPUT_INVALID");
  assert.equal(payload.message, "Bad input");
  assert.equal(payload.hint, "Use valid input");
  assert.deepEqual(payload.details, { field: "runtime_file" });
});

test("toErrorPayload sanitizes sensitive detail fields and token-like message content", () => {
  const error = new StratosphereError({
    code: "PIPELINE_FAILED",
    message: "request failed with token=abc123",
    details: {
      token: "abc123",
      nested: {
        authorization: "Bearer test-token",
        safe: "ok",
      },
    },
  });

  const payload = toErrorPayload(error);
  assert.equal(payload.message.includes("abc123"), false);
  assert.deepEqual(payload.details, {
    token: "[REDACTED]",
    nested: {
      authorization: "[REDACTED]",
      safe: "ok",
    },
  });
});

test("toErrorPayload handles native Error objects", () => {
  const payload = toErrorPayload(new Error("boom"));
  assert.equal(payload.code, "PIPELINE_FAILED");
  assert.equal(payload.message, "boom");
  assert.ok(payload.hint);
});

test("toErrorPayload handles non-Error throwables", () => {
  const payload = toErrorPayload("bad");
  assert.equal(payload.code, "PIPELINE_FAILED");
  assert.equal(payload.message, "bad");
  assert.ok(payload.hint);
});

test("toUserFacingError provides title and next steps for non-technical users", () => {
  const user = toUserFacingError(
    new StratosphereError({
      code: "INPUT_MISSING",
      message: "runtime_file is required",
    }),
    { operation: "MIGRATION_GENERATION_FAILED" }
  );

  assert.equal(user.code, "INPUT_MISSING");
  assert.ok(user.title.length > 0);
  assert.ok(user.hint.length > 0);
  assert.ok(Array.isArray(user.nextSteps));
  assert.ok(user.nextSteps.length > 0);
  assert.equal(user.operation, "MIGRATION_GENERATION_FAILED");
});

test("sanitizeErrorDetails redacts sensitive keys recursively", () => {
  const details = sanitizeErrorDetails({
    password: "abc",
    nested: {
      apiKey: "xyz",
      nonSensitive: "ok",
    },
  });

  assert.deepEqual(details, {
    password: "[REDACTED]",
    nested: {
      apiKey: "[REDACTED]",
      nonSensitive: "ok",
    },
  });
});

test("runMigrationPipeline fails with INPUT_MISSING for snapshot mode without runtime", async () => {
  await assert.rejects(
    () =>
      runMigrationPipeline({
        migrationId: "invalid-run",
        outDir: "/tmp/stratosphere-invalid",
        discoveryMode: "snapshot",
      }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_MISSING");
      return true;
    }
  );
});
