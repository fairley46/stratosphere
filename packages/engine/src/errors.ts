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

export function toErrorPayload(error: unknown): StratosphereErrorPayload {
  if (error instanceof StratosphereError) {
    return {
      code: error.code,
      message: error.message,
      hint: error.hint,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: "PIPELINE_FAILED",
      message: error.message,
      hint: "Inspect logs and retry with validated inputs.",
    };
  }

  return {
    code: "PIPELINE_FAILED",
    message: String(error),
    hint: "Unexpected error shape encountered. Retry and inspect runtime context.",
  };
}
