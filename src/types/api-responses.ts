/**
 * API Response Types
 * Type definitions for all ACTA API endpoint responses
 */

/**
 * Configuration response from /config endpoint
 */
export interface ConfigResponse {
  rpcUrl: string;
  networkPassphrase: string;
  actaContractId: string;
}

/**
 * Health check response from /health endpoint
 */
export interface HealthResponse {
  status: string;
  timestamp: string;
  service: string;
  port?: number | string;
  env?: Record<string, unknown>;
}

/**
 * Transaction preparation response (prepare mode)
 * Returns unsigned XDR and network passphrase
 */
export interface TxPrepareResponse {
  xdr: string;
  network: string;
}

/**
 * Transaction submission response (submit mode)
 * Returns transaction ID
 */
export interface TxSubmitResponse {
  tx_id: string;
}

/**
 * Combined response for endpoints that support both prepare and submit
 * Type guard helpers are available to distinguish between prepare and submit responses
 */
export type TxResponse = TxPrepareResponse | TxSubmitResponse;

/**
 * Type guard to check if response is a prepare response
 */
export function isTxPrepareResponse(
  response: TxResponse
): response is TxPrepareResponse {
  return "xdr" in response && "network" in response;
}

/**
 * Type guard to check if response is a submit response
 */
export function isTxSubmitResponse(
  response: TxResponse
): response is TxSubmitResponse {
  return "tx_id" in response;
}

/**
 * Vault create response
 */
export type VaultCreateResponse = TxResponse;

/**
 * Vault authorize issuer response
 */
export type VaultAuthorizeIssuerResponse = TxResponse;

/**
 * Vault revoke issuer response
 */
export type VaultRevokeIssuerResponse = TxResponse;

/**
 * VC issue response
 */
export type VcIssueResponse = TxResponse;

/**
 * VC issue-linked response (same prepare/submit shape as `vc/issue`).
 * Returned by `POST /contracts/vc/issue-linked`.
 */
export type VcIssueLinkedResponse = TxResponse;

/**
 * Parent link for a VC returned by `POST /contracts/vault/get-vc-parent`.
 * Matches API JSON (`vc_id` from the contract).
 */
export interface VaultVcParentInfo {
  owner: string;
  vc_id: string;
}

/**
 * Response from `POST /contracts/vault/get-vc-parent`.
 */
export interface VaultGetVcParentResponse {
  parent: VaultVcParentInfo | null;
}

/**
 * VC revoke response
 */
export type VcRevokeResponse = TxResponse;

/**
 * Vault revoke vault response
 */
export type VaultRevokeVaultResponse = TxResponse;

/**
 * Vault list VC IDs response.
 * Returned by `/contracts/vault/list-vc-ids`.
 */
export interface VaultListVcIdsResponse {
  /**
   * List of credential identifiers returned by the unified contracts API.
   * This is the preferred field for new integrations.
   */
  vc_ids?: string[];

  /**
   * Optional legacy-style field that may contain the same credential IDs.
   * Some lower-level contract helpers can still return this shape.
   */
  result?: string[];
}

/**
 * Vault get VC response.
 * Returned by `/contracts/vault/get-vc`.
 */
export interface VaultGetVcResponse {
  /**
   * Verifiable Credential object returned by the ACTA contract.
   * This is the high-level, normalized representation.
   */
  vc?: unknown;

  /**
   * Optional raw contract result (low-level Soroban data or legacy format).
   * Prefer using `vc` when available.
   */
  result?: unknown;
}

/**
 * Vault verify VC response.
 * Returned by `/contracts/vault/verify-vc`.
 */
export interface VaultVerifyVcResponse {
  /**
   * Verification status of the credential:
   * - `"valid"`: the credential is currently valid in the vault/issuance contract.
   * - `"revoked"`: the credential has been revoked.
   */
  status: "valid" | "revoked";

  /**
   * Optional ISO timestamp for when the VC entered the current `status`
   * (for example, revocation time when status is `"revoked"`).
   */
  since?: string;
}

/**
 * Contract version response from /contracts/version endpoint
 */
export interface ContractVersionResponse {
  version: string;
}

/**
 * Vault migrate response
 */
export type VaultMigrateResponse = TxResponse;

/**
 * Vault push response
 */
export type VaultPushResponse = TxResponse;

/**
 * Vault set new owner response
 */
export type VaultSetNewOwnerResponse = TxResponse;

/**
 * Vault authorize issuers (bulk) response
 */
export type VaultAuthorizeIssuersResponse = TxResponse;

/**
 * Sponsored vault create response
 */
export type SponsoredVaultCreateResponse = TxResponse;

/**
 * Sponsored vault set open-to-all flag response
 */
export type SponsoredVaultSetOpenToAllResponse = TxResponse;

/**
 * Sponsored vault add sponsor response
 */
export type SponsoredVaultAddSponsorResponse = TxResponse;

/**
 * Sponsored vault remove sponsor response
 */
export type SponsoredVaultRemoveSponsorResponse = TxResponse;

/**
 * Sponsored vault `open_to_all` read response.
 * Returned by `GET /contracts/sponsored-vault/open-to-all`.
 */
export interface SponsoredVaultOpenToAllReadResponse {
  /**
   * `true` si los sponsored vaults pueden crearse por cualquier caller.
   * `false` si solo los sponsors permitidos pueden crear sponsored vaults.
   */
  open: boolean;
}
