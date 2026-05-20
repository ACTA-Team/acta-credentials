/**
 * API Response Types
 * Type definitions for all ACTA API endpoint responses.
 *
 * Updated for API v1.2.0 / vc-vault v0.3.0:
 * - `VaultVerifyVcResponse.status` now includes `"invalid"` and `"unknown"`.
 * - `VaultListVcIdsResponse` reports the resolved `offset` and `limit`.
 * - New shapes for `batch-issue`, `vc-count`, issuer lists/counts, vault
 *   metadata, and the `vc-issuer-registry` endpoints.
 * - `VaultMigrateResponse` removed (the `/contracts/vault/migrate` endpoint
 *   was removed alongside the contract function).
 */

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/**
 * Configuration response from `/config`.
 */
export interface ConfigResponse {
  rpcUrl: string;
  networkPassphrase: string;
  actaContractId: string;
}

/**
 * Health check response from `/health`.
 */
export interface HealthResponse {
  status: string;
  timestamp: string;
  service: string;
  port?: number | string;
  env?: Record<string, unknown>;
}

/**
 * Transaction preparation response (prepare mode). Returns the unsigned XDR
 * and the network passphrase the caller must sign for.
 */
export interface TxPrepareResponse {
  xdr: string;
  network: string;
}

/**
 * Transaction submission response (submit mode).
 */
export interface TxSubmitResponse {
  tx_id: string;
}

/**
 * Combined response for endpoints that support both prepare and submit.
 * Use {@link isTxPrepareResponse} / {@link isTxSubmitResponse} to narrow.
 */
export type TxResponse = TxPrepareResponse | TxSubmitResponse;

export function isTxPrepareResponse(
  response: TxResponse
): response is TxPrepareResponse {
  return "xdr" in response && "network" in response;
}

export function isTxSubmitResponse(
  response: TxResponse
): response is TxSubmitResponse {
  return "tx_id" in response;
}

// ---------------------------------------------------------------------------
// Vault — mutation responses (all prepare/submit)
// ---------------------------------------------------------------------------

export type VaultCreateResponse = TxResponse;
export type VaultAuthorizeIssuerResponse = TxResponse;
export type VaultAuthorizeIssuersResponse = TxResponse;
export type VaultRevokeIssuerResponse = TxResponse;
export type VaultRevokeVaultResponse = TxResponse;
export type VaultSetNewOwnerResponse = TxResponse;
export type VaultPushResponse = TxResponse;

// ---------------------------------------------------------------------------
// VC — mutation responses
// ---------------------------------------------------------------------------

export type VcIssueResponse = TxResponse;
export type VcIssueLinkedResponse = TxResponse;
export type VcBatchIssueResponse = TxResponse;
export type VcRevokeResponse = TxResponse;

// ---------------------------------------------------------------------------
// Vault — read responses
// ---------------------------------------------------------------------------

/**
 * Vault list VC IDs response (paginated as of API v1.2.0).
 * Returned by `POST /contracts/vault/list-vc-ids`.
 */
export interface VaultListVcIdsResponse {
  /**
   * List of credential identifiers. The API returns this under `result`.
   * The optional `vc_ids` alias is preserved for forward-compat with any
   * future shape change but is currently always `undefined`.
   */
  vc_ids?: string[];
  result?: string[];
  /** Resolved `offset` (after defaults). Echoed by the API for clarity. */
  offset?: number;
  /** Resolved `limit` (after defaults). */
  limit?: number;
}

export interface VaultGetVcResponse {
  vc?: unknown;
  result?: unknown;
}

/**
 * Parent link for a VC returned by `POST /contracts/vault/get-vc-parent`.
 */
export interface VaultVcParentInfo {
  owner: string;
  vc_id: string;
}

export interface VaultGetVcParentResponse {
  parent: VaultVcParentInfo | null;
}

/**
 * Vault verify VC response. Returned by `POST /contracts/vault/verify-vc`.
 *
 * - `"valid"` — credential is present and not revoked.
 * - `"revoked"` — `since` carries the ISO-8601 timestamp the owner passed to `revoke`.
 * - `"invalid"` — credential does not exist in the vault (returned by the
 *   contract's `VCStatus::Invalid`).
 * - `"unknown"` — defensive fallback when the API returns a value the SDK
 *   does not recognise.
 */
export interface VaultVerifyVcResponse {
  status: "valid" | "revoked" | "invalid" | "unknown";
  since?: string;
}

/** O(1) active-VC count. */
export interface VaultVcCountResponse {
  count: number;
}

/** Paginated list of issuer addresses. */
export interface VaultIssuerListResponse {
  issuers: string[];
  offset: number;
  limit: number;
}

/** O(1) issuer count (authorized or denied bucket). */
export interface VaultIssuerCountResponse {
  count: number;
}

/**
 * Combined vault metadata returned by `GET /contracts/vault/:owner`.
 *
 * `admin`, `did_uri` and `revoked` come from the contract's per-vault
 * persistent ledger entries (read directly via `getLedgerEntries`).
 * Uninitialised vaults return `null` / `null` / `false`.
 */
export interface VaultMetadataResponse {
  owner: string;
  admin: string | null;
  did_uri: string | null;
  revoked: boolean;
  vc_count: number;
  authorized_issuer_count: number;
}

// ---------------------------------------------------------------------------
// Contract version
// ---------------------------------------------------------------------------

export interface ContractVersionResponse {
  version: string;
}

// ---------------------------------------------------------------------------
// Sponsored vault
// ---------------------------------------------------------------------------

export type SponsoredVaultCreateResponse = TxResponse;
export type SponsoredVaultSetOpenToAllResponse = TxResponse;
export type SponsoredVaultAddSponsorResponse = TxResponse;
export type SponsoredVaultRemoveSponsorResponse = TxResponse;

export interface SponsoredVaultOpenToAllReadResponse {
  /**
   * `true` if anyone can create sponsored vaults; `false` if only the
   * configured sponsor allowlist may.
   */
  open: boolean;
}

// ---------------------------------------------------------------------------
// Issuer registry (vc-issuer-registry, API v1.2.0)
// ---------------------------------------------------------------------------

export type IssuerRegistryAddResponse = TxResponse;
export type IssuerRegistrySetMetadataResponse = TxResponse;
export type IssuerRegistrySetAllowedResponse = TxResponse;
export type IssuerRegistryRemoveResponse = TxResponse;

export interface IssuerRecord {
  allowed: boolean;
  name: string | null;
  did: string | null;
  url: string | null;
}

export interface IssuerRegistryIsAllowedResponse {
  allowed: boolean;
}

export interface IssuerRegistryStatusResponse {
  admin: string;
  version: string;
}
