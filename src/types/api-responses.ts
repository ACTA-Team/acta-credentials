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
  /** Network the API is serving ('mainnet' | 'testnet'). */
  networkType?: "mainnet" | "testnet";
  /**
   * `vc-vault-factory` contract id (v0.4.0). The SDK derives each owner's
   * single-tenant vault from this. `actaContractId` is a back-compat alias
   * that now also points at the factory.
   */
  factoryContractId?: string;
  actaContractId: string;
  /** Installed vault template WASM hash (hex). */
  vaultWasmHash?: string;
  /** `did-stellar-registry` contract id for the active network. */
  didStellarRegistryId?: string;
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
 * Vault push response
 */
export type VaultPushResponse = TxResponse;

/**
 * Vault set new owner response
 */
export type VaultSetNewOwnerResponse = TxResponse;

/**
 * Vault set did_uri response
 */
export type VaultSetDidResponse = TxResponse;

/**
 * Sponsored vault create response
 */
export type SponsoredVaultCreateResponse = TxResponse;
