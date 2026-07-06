/**
 * Normalized error surfaced by {@link ActaClient} for every failed request.
 *
 * The raw `AxiosError` is hard to consume (its `message` is the opaque
 * `"Request failed with status code 4xx"`, and the useful bits live under
 * `error.response.data`). `ActaApiError` flattens that into a stable shape so
 * integrators can branch on `status` / `code` instead of digging through the
 * axios object. The ACTA API error body (`{ error, message, request_id }`) is
 * mapped onto `code` / `message` / `requestId`.
 */
export class ActaApiError extends Error {
  /** HTTP status code, or 0 when the request never got a response. */
  readonly status: number;
  /** Stable machine-readable code from the API body (`error` field), or a synthetic one. */
  readonly code: string;
  /** Correlation id from the API (`request_id`), when present. */
  readonly requestId?: string;
  /** True when the request aborted on the client timeout. */
  readonly isTimeout: boolean;
  /** True when no response was received (network/DNS/CORS/offline). */
  readonly isNetworkError: boolean;
  /** Raw response body, for advanced callers. */
  readonly details?: unknown;

  constructor(args: {
    status: number;
    code: string;
    message: string;
    requestId?: string;
    isTimeout?: boolean;
    isNetworkError?: boolean;
    details?: unknown;
    cause?: unknown;
  }) {
    super(args.message);
    this.name = "ActaApiError";
    this.status = args.status;
    this.code = args.code;
    if (args.requestId !== undefined) this.requestId = args.requestId;
    this.isTimeout = args.isTimeout ?? false;
    this.isNetworkError = args.isNetworkError ?? false;
    this.details = args.details;
    // `Error(message, { cause })` isn't typed under the ES2020 lib target, so
    // attach the original error manually.
    if (args.cause !== undefined) (this as { cause?: unknown }).cause = args.cause;
  }
}

interface ActaApiErrorBody {
  error?: string;
  message?: string;
  request_id?: string;
}

/** Minimal shape of an axios error we depend on (avoids importing axios types here). */
interface AxiosLikeError {
  isAxiosError?: boolean;
  code?: string;
  message?: string;
  response?: { status?: number; data?: unknown };
}

/**
 * Convert an unknown thrown value (typically an `AxiosError`) into an
 * {@link ActaApiError}. Non-axios errors are wrapped verbatim.
 */
export function normalizeError(err: unknown): ActaApiError {
  if (err instanceof ActaApiError) return err;

  const e = err as AxiosLikeError;
  const isTimeout = e?.code === "ECONNABORTED" || /timeout/i.test(e?.message ?? "");

  if (e?.response) {
    const status = e.response.status ?? 0;
    const body = (e.response.data ?? {}) as ActaApiErrorBody;
    return new ActaApiError({
      status,
      code: body.error ?? `http_${status}`,
      message: body.message ?? e.message ?? `Request failed with status ${status}`,
      ...(body.request_id !== undefined ? { requestId: body.request_id } : {}),
      details: e.response.data,
      cause: err,
    });
  }

  // No response: timeout or network-level failure.
  return new ActaApiError({
    status: 0,
    code: isTimeout ? "timeout" : "network_error",
    message: e?.message ?? "Network request failed",
    isTimeout,
    isNetworkError: !isTimeout,
    cause: err,
  });
}
