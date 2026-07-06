# Changelog

All notable changes to `@acta-team/credentials` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.4] - 2026-07-06 - audit fixes (crypto, errors, hooks, at-rest key encryption)

Backward compatible. No public API removed (see "Deprecated" for what is
scheduled for the next major).

### Fixed

- **Auto-onboarding crash**: issuer-identity creation used the synchronous
  `ed25519.getPublicKey`, which throws `hashes.sha512Sync not set` in
  `@noble/ed25519` v2. Switched to `getPublicKeyAsync`, so
  `useCredential().issue()` without an explicit `issuerDid` now works.
- Hooks (`useVault`, `useCredential`, `useVaultRead`) now return a **stable,
  memoized** object (`useMemo([client])`) instead of a fresh one every render,
  so their methods are safe to use in effect/callback dependency arrays.
- `ActaConfig` recreates the client when `baseURL`/`apiKey` change (was frozen
  after first render), so switching network at runtime takes effect.

### Added

- **`ActaApiError`**: every client request now rejects with a normalized error
  (`status`, `code`, `message`, `requestId`, `isTimeout`, `isNetworkError`)
  instead of a raw `AxiosError`. Exported alongside `normalizeError`.
- HTTP client now has a **30s default timeout** (configurable via
  `identityOptions.timeoutMs`).
- **At-rest encryption** of the Ed25519 assertion private key in the default
  IndexedDB storage (AES-256-GCM with a non-extractable WebCrypto key). Legacy
  plaintext records are still read transparently.
- `client.clearConfigCache()` and a **TTL** on the `/config` cache (default 5
  min, configurable via `identityOptions.configCacheTtlMs`) — a rotated
  contract id is now picked up.
- `"sideEffects": false` for better tree-shaking.
- First **test suite** (Jest): helpers, response guards, error normalization,
  and issuer-identity creation (regression-guards the crypto fix above).

### Changed

- `baseURL` type widened from a 2-value literal union to `string` (the two
  production URLs are still suggested by autocomplete), so integrators can point
  at staging, a self-hosted API, or `localhost`.
- In-memory issuer storage now logs a warning in Node, since it does not persist
  across restarts (each restart would mint a new DID). Provide a persistent
  `IssuerIdentityStorage` server-side.
- `ActaConfigProps.children` typed as `React.ReactNode` (was `any`).

### Deprecated

- The following already-deprecated methods remain for backward compatibility but
  will be **removed in the next major (2.0.0)**: `createCredential`,
  `getDefaults`, `prepareStoreTx`, `prepareListVcIdsTx`, `prepareGetVcTx`,
  `vaultStore` (and the `CreateCredentialPayload` / `CreateCredentialResponse`
  types). Migrate to `vcIssue` / `getConfig` / `vaultListVcIdsDirect` /
  `vaultGetVcDirect`. Removing them is a breaking change and is intentionally
  deferred to a major bump.

## [1.1.3] - 2026-06-30 - set-vault-did + drop dead v0.3.0 methods

### Added

- `client.vaultSetDid(...)` for `POST /contracts/vault/set-vault-did` (sets the
  vault's `did_uri`; owner signs). Supports `userSalt` / `vaultContract`.

### Removed (breaking)

- Methods (and their response types) that targeted endpoints removed in the
  v0.4.0 API and now return 404: `vaultMigrate`, `vaultAuthorizeIssuers` (batch),
  `sponsoredVaultSetOpenToAll`, `getSponsoredVaultOpenToAll`,
  `sponsoredVaultAddSponsor`, `sponsoredVaultRemoveSponsor`. Also dropped the
  orphaned `VcIssueLinkedResponse` and `VaultGetVcParent*` types. Issuer
  blocking is the deny-by-exception model (`vaultDenyIssuer` / `vaultAllowIssuer`).

## [1.1.2] - 2026-06-30 - vc-vault-factory v0.4.0 + did:stellar

Aligns the SDK with the v0.4.0 API (factory + single-tenant vaults) and
`did:stellar` issuance. The SDK is a thin client and the API derives each
owner's vault address server-side, so the surface changes are focused.

### Added

- Issuer deny-list (deny-by-exception model; issuance is open by default):
  - `client.vaultDenyIssuer(...)` for `POST /contracts/vault/deny-issuer`
  - `client.vaultAllowIssuer(...)` for `POST /contracts/vault/allow-issuer`
  - `useVault().denyIssuer(...)` / `useVault().allowIssuer(...)`
- Optional `userSalt` passthrough on `createVault`, `issue`, `revoke`, and the
  issuer deny/allow helpers (selects which deterministic vault to target).
- `getContractVersion({ owner })` for a per-vault version.
- `ConfigResponse` now surfaces `factoryContractId`, `networkType`,
  `vaultWasmHash`, and `didStellarRegistryId` (with `actaContractId` retained as
  an alias).

### Fixed

- `useCredential().revoke(...)` now sends `owner`. The v0.4.0 API needs it to
  derive the single-tenant vault; without it, revocation could not resolve a
  vault.

### Changed

- `useVault().authorizeIssuer` / `revokeIssuer` keep working but now map to the
  API's `allow-issuer` / `deny-issuer` aliases. Prefer `allowIssuer` /
  `denyIssuer` going forward.
- Issuance requires a resolvable `did:stellar` issuer whose controller matches
  the signer (enforced by the API). `useCredential().issue` continues to
  auto-resolve the issuer DID via `getOrCreateIssuerIdentity` when omitted.

### Removed (breaking)

- `client.vcIssueLinked` and `useCredential().issueLinked` (linked credentials
  dropped in v0.4.0).
- `client.vaultGetVcParent` and `useVaultRead().getVcParent`.

### Notes

- A few now-unused response types (`VcIssueLinkedResponse`,
  `VaultGetVcParentResponse`, `VaultVcParentInfo`) remain exported and are
  harmless; they will be pruned in a later cleanup.
- Requires `acta-api` v1.1.1.
