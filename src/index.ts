/**
 * Entry point for the ACTA SDK.
 *
 * Exposes the provider, client hooks, environment base URLs,
 * and re-exports hooks and types.
 */
export { ActaConfig } from "./providers/ActaProvider";
export { useActaClient } from "./providers/ActaClientContext";

/** Base API URL for ACTA mainnet. */
export const mainNet = "https://api.mainnet.acta.build";
/** Base API URL for ACTA testnet. */
export const testNet = "https://api.testnet.acta.build";

/** Re-export all hooks. */
export * from "./hooks";
/** Re-export all type definitions. */
export * from "./types";
