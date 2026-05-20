/**
 * Entry point for the ACTA SDK (`@acta-team/credentials`).
 *
 * Exposes the React provider/context, the raw `ActaClient`, the typed
 * `ActaError`, the per-contract `CONTRACT_LIMITS`, and re-exports the
 * hooks and shared types.
 */
export { ActaConfig } from "./providers/ActaProvider";
export { useActaClient } from "./providers/ActaClientContext";
export { ActaClient } from "./client";

/** Base API URL for ACTA mainnet. */
export const mainNet = "https://acta.build/api/mainnet";
/** Base API URL for ACTA testnet. */
export const testNet = "https://acta.build/api/testnet";

/** Typed error thrown by every `ActaClient` method on non-2xx. */
export { ActaError, actaErrorFromAxios } from "./utils/acta-error";
export type { ActaErrorCode } from "./utils/acta-error";

/** Mirrors the contract-side caps so UIs can validate inputs locally. */
export { CONTRACT_LIMITS } from "./utils/contract-limits";
export type { ContractLimits } from "./utils/contract-limits";

/** Re-export all hooks. */
export * from "./hooks";
/** Re-export all type definitions. */
export * from "./types";
