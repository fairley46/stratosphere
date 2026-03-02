import assert from "node:assert/strict";
import test from "node:test";
import { StratosphereError, runMigrationPipeline, toErrorPayload } from "../packages/engine/dist/index.js";

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
