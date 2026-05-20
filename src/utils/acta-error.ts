/**
 * Typed error for failures coming back from the ACTA API.
 *
 * The API returns a stable JSON shape on errors:
 *
 *     {
 *       "error":   "vc_already_exists",   // machine-readable code
 *       "message": "Error(Contract, #12)",
 *       "request_id": "...",
 *       "retry_after": 30
 *     }
 *
 * `ActaError` extracts that into a JS error so consumers can branch on
 * `err.code` instead of substring-matching the message. The axios
 * interceptor installed by {@link ActaClient} converts every non-2xx
 * response into one of these.
 *
 * The `code` field is left as a free-form string (typed loosely via
 * {@link ActaErrorCode}) so future contracts / new error codes don't break
 * the type. Match the catalogue in
 * `acta-api/docs/integrators/error-codes.md` when adding handling.
 */

/** Known error codes shipped by the API as of v1.2.0. Strings are kept open
 *  so unknown future codes still match `ActaErrorCode`. */
export type ActaErrorCode =
  // Generic
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "internal_error"
  | "rate_limit_exceeded"
  | "write_rate_limit_exceeded"
  | "rate_limit_unavailable"
  // vc-vault
  | "vault_already_exists"
  | "issuer_not_authorized"
  | "issuer_already_authorized"
  | "vault_revoked"
  | "vc_not_found"
  | "vc_already_revoked"
  | "vault_not_initialized"
  | "contract_not_initialized"
  | "invalid_vault_contract"
  | "not_authorized_sponsor"
  | "vc_already_exists"
  | "no_pending_admin"
  | "parent_vc_invalid"
  | "vault_full"
  | "limit_too_large"
  | "batch_too_large"
  | "batch_empty"
  | "input_too_long"
  | "issuer_list_too_long"
  | "invalid_fee_amount"
  | "fee_out_of_bounds"
  // vc-issuer-registry
  | "issuer_registry_already_initialized"
  | "issuer_not_found"
  | "issuer_already_exists"
  | "issuer_registry_not_initialized"
  | "invalid_issuer_metadata"
  // Fallback for forward-compat
  | (string & {});

/**
 * Error thrown by every `ActaClient` method when the API returns a non-2xx.
 */
export class ActaError extends Error {
  /** Stable, machine-readable code (e.g. `vc_already_exists`). */
  readonly code: ActaErrorCode;
  /** Original HTTP status code returned by the API. */
  readonly httpStatus: number;
  /** Per-request correlation ID; useful when filing support tickets. */
  readonly requestId?: string;
  /** Server-suggested wait in seconds (for `429` responses). */
  readonly retryAfter?: number;
  /** Optional details map returned by the server (validation errors, etc.). */
  readonly details?: Record<string, unknown>;

  constructor(opts: {
    code: ActaErrorCode;
    httpStatus: number;
    message?: string;
    requestId?: string;
    retryAfter?: number;
    details?: Record<string, unknown>;
  }) {
    super(opts.message || opts.code);
    this.name = "ActaError";
    this.code = opts.code;
    this.httpStatus = opts.httpStatus;
    this.requestId = opts.requestId;
    this.retryAfter = opts.retryAfter;
    this.details = opts.details;
  }
}

/**
 * Best-effort conversion of an axios error into an {@link ActaError}.
 * Falls back to a generic `internal_error` / `network_error` when the
 * response shape does not match the ACTA contract.
 */
export function actaErrorFromAxios(err: unknown): ActaError {
  const anyErr = err as {
    response?: {
      status?: number;
      data?: {
        error?: string;
        message?: string;
        request_id?: string;
        retry_after?: number;
        details?: Record<string, unknown>;
      };
    };
    message?: string;
  };
  const status = anyErr?.response?.status;
  const body = anyErr?.response?.data;

  if (status && body && typeof body.error === "string") {
    return new ActaError({
      code: body.error,
      httpStatus: status,
      message: body.message || body.error,
      requestId: body.request_id,
      retryAfter: body.retry_after,
      details: body.details,
    });
  }

  return new ActaError({
    code: status ? "bad_request" : "network_error",
    httpStatus: status ?? 0,
    message:
      anyErr?.message || (status ? `HTTP ${status}` : "Network request failed"),
  });
}
