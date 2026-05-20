/**
 * On-chain limits exposed by `vc-vault` v0.3.0 and `vc-issuer-registry`.
 *
 * Mirrors the constants in `contracts-acta/contracts/vc-vault/src/constants.rs`
 * (and the equivalent in `vc-issuer-registry/src/contract.rs`). Exported so
 * UI components and validation layers can stay in sync with the contract
 * without each consumer maintaining its own copy.
 *
 * Keep these values aligned with the contracts — they are NOT enforced
 * client-side by the SDK; they are guidance. The API and the contract both
 * reject anything that exceeds them.
 */

export const CONTRACT_LIMITS = {
  /** Hard cap on `limit` for any paginated listing (`list_vc_ids`, issuers). */
  MAX_LIST_LIMIT: 200,
  /** Maximum credentials per `batch_issue` call. */
  MAX_BATCH_SIZE: 5,
  /** Maximum bytes for `vc_id` strings. */
  MAX_VC_ID_LEN: 64,
  /** Maximum bytes for `vc_data` payloads. */
  MAX_VC_DATA_LEN: 10_000,
  /** Maximum bytes for vault `did_uri`. */
  MAX_DID_URI_LEN: 256,
  /** Maximum bytes for `issuer_did`. */
  MAX_ISSUER_DID_LEN: 256,
  /** Maximum bytes for revocation `date` strings (ISO 8601). */
  MAX_DATE_LEN: 64,
  /** Maximum number of addresses accepted by `authorize_issuers(list)`. */
  MAX_ISSUERS_LIST: 100,
  /** Maximum bytes for `vc-issuer-registry` metadata fields (`did`, `url`). */
  MAX_ISSUER_REGISTRY_METADATA_BYTES: 256,
} as const;

export type ContractLimits = typeof CONTRACT_LIMITS;
