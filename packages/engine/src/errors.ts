export type StratosphereErrorCode =
  | "INPUT_INVALID"
  | "INPUT_MISSING"
  | "INPUT_CONFLICT"
  | "DISCOVERY_FAILED"
  | "DISCOVERY_NO_PROCESS_DATA"
  | "PIPELINE_FAILED"
  | "FILE_READ_FAILED"
  | "JSON_PARSE_FAILED";

export type StratosphereErrorPayload = {
  code: StratosphereErrorCode;
  message: string;
  hint?: string;
  details?: Record<string, unknown>;
};

export type UserFacingError = {
  code: StratosphereErrorCode;
  title: string;
  message: string;
  hint: string;
  nextSteps: string[];
  operation?: string;
  details?: Record<string, unknown>;
};

export class StratosphereError extends Error {
  readonly code: StratosphereErrorCode;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;

  constructor(payload: StratosphereErrorPayload) {
    super(payload.message);
    this.name = "StratosphereError";
    this.code = payload.code;
    this.hint = payload.hint;
    this.details = payload.details;
  }
}

const SENSITIVE_KEY_PATTERN = /(token|secret|password|authorization|privatekey|api[_-]?key)/i;
const TOKEN_LIKE_VALUE_PATTERN = /(gh[pousr]_[a-zA-Z0-9_]+|glpat-[a-zA-Z0-9_-]+)/g;

const CODE_TITLES: Record<StratosphereErrorCode, string> = {
  INPUT_INVALID: "Some information is in an invalid format.",
  INPUT_MISSING: "Required information is missing.",
  INPUT_CONFLICT: "Two selected options conflict with each other.",
  DISCOVERY_FAILED: "Runtime discovery could not complete.",
  DISCOVERY_NO_PROCESS_DATA: "Stratosphere could not see running application processes.",
  PIPELINE_FAILED: "Stratosphere could not complete this migration run.",
  FILE_READ_FAILED: "A required file could not be read.",
  JSON_PARSE_FAILED: "A JSON input file is malformed.",
};

const CODE_HINTS: Record<StratosphereErrorCode, string> = {
  INPUT_INVALID: "Fix the highlighted input and retry. If unsure, use the guided wizard mode.",
  INPUT_MISSING: "Provide the missing input and run again. The wizard can collect this step-by-step.",
  INPUT_CONFLICT: "Remove conflicting flags or use one discovery mode at a time.",
  DISCOVERY_FAILED: "Check VM access, permissions, and command allowlist constraints, then retry.",
  DISCOVERY_NO_PROCESS_DATA: "Use an account that can inspect process data, or provide a snapshot fallback.",
  PIPELINE_FAILED: "Retry with validated inputs. If this repeats, share the sanitized details with engineering.",
  FILE_READ_FAILED: "Verify file path, permissions, and existence on disk.",
  JSON_PARSE_FAILED: "Fix JSON syntax and required fields, then retry.",
};

const CODE_STEPS: Record<StratosphereErrorCode, string[]> = {
  INPUT_INVALID: ["Correct the invalid field value.", "Re-run the command or MCP tool.", "Use `--wizard` for guided setup."],
  INPUT_MISSING: ["Provide the missing input.", "Re-run the command or MCP tool.", "Use `--wizard` if you prefer prompts."],
  INPUT_CONFLICT: ["Remove one of the conflicting options.", "Re-run with a single mode/configuration."],
  DISCOVERY_FAILED: ["Check connectivity and permissions.", "Retry discovery.", "Provide snapshot fallback if needed."],
  DISCOVERY_NO_PROCESS_DATA: ["Validate account permissions for process inspection.", "Retry with snapshot fallback input."],
  PIPELINE_FAILED: ["Retry once.", "If it fails again, escalate with the sanitized details block."],
  FILE_READ_FAILED: ["Confirm the file path exists.", "Confirm read permissions.", "Retry after correcting path/permissions."],
  JSON_PARSE_FAILED: ["Validate JSON syntax.", "Validate required fields.", "Retry after correcting the file."],
};

function sanitizeText(value: string): string {
  return value
    .replace(TOKEN_LIKE_VALUE_PATTERN, "[REDACTED_TOKEN]")
    .replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, "$1[REDACTED_TOKEN]")
    .replace(/(x-access-token:)([^@/\s]+)/gi, "$1[REDACTED]")
    .replace(/(oauth2:)([^@/\s]+)/gi, "$1[REDACTED]")
    .replace(/(token=)[^&\s]+/gi, "$1[REDACTED]");
}

function sanitizeUnknown(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeUnknown(item, depth + 1));
  if (typeof value !== "object") return String(value);

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = "[REDACTED]";
      continue;
    }
    out[key] = sanitizeUnknown(entry, depth + 1);
  }
  return out;
}

export function sanitizeErrorDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details) return undefined;
  return sanitizeUnknown(details) as Record<string, unknown>;
}

export function toErrorPayload(error: unknown): StratosphereErrorPayload {
  const fallbackHint = CODE_HINTS.PIPELINE_FAILED;

  if (error instanceof StratosphereError) {
    return {
      code: error.code,
      message: sanitizeText(error.message),
      hint: error.hint ? sanitizeText(error.hint) : CODE_HINTS[error.code],
      details: sanitizeErrorDetails(error.details),
    };
  }

  if (error instanceof Error) {
    return {
      code: "PIPELINE_FAILED",
      message: sanitizeText(error.message),
      hint: fallbackHint,
    };
  }

  return {
    code: "PIPELINE_FAILED",
    message: sanitizeText(String(error)),
    hint: fallbackHint,
  };
}

export function toUserFacingError(error: unknown, options?: { operation?: string }): UserFacingError {
  const payload = toErrorPayload(error);
  return {
    code: payload.code,
    operation: options?.operation,
    title: CODE_TITLES[payload.code] ?? CODE_TITLES.PIPELINE_FAILED,
    message: payload.message,
    hint: payload.hint ?? CODE_HINTS[payload.code] ?? CODE_HINTS.PIPELINE_FAILED,
    nextSteps: CODE_STEPS[payload.code] ?? CODE_STEPS.PIPELINE_FAILED,
    details: payload.details,
  };
}
