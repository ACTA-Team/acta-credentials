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

/**
 * Re-export the issuer-identity layer. Most consumers do not need to
 * import from here — `useCredential().issue()` and
 * `ActaClient.getOrCreateIssuerIdentity()` cover the common path.
 */
export * from "./identity";

/** Direct access to the HTTP client for advanced flows. */
export { ActaClient } from "./client";
export type { ActaClientIdentityOptions } from "./client";

/** Normalized error type thrown by every client request. */
export { ActaApiError, normalizeError } from "./errors";
