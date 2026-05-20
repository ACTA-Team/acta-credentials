/**
 * React hooks for the ACTA SDK.
 *
 * Thin wrappers around `ActaClient` for idiomatic usage in React apps.
 * Organised by domain:
 *
 * - {@link useVault}        — vault lifecycle (create, authorize, revoke).
 * - {@link useVaultRead}    — paginated reads + metadata + verify.
 * - {@link useVaultIssuers} — issuer lists/counts per vault.
 * - {@link useCredential}   — issue / issueLinked / batchIssue / revoke.
 * - {@link useIssuerRegistry} — global vc-issuer-registry allowlist
 *   (available once the contract is deployed).
 */
export * from "./useVault";
export * from "./useCredential";
export * from "./useVaultRead";
export * from "./useVaultIssuers";
export * from "./useIssuerRegistry";
