# Changelog

All notable changes to `@acta-team/credentials` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
