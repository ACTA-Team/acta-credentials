# Changelog

All notable changes to `@acta-team/credentials` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.2] - 2026-05-19 — Align with `acta-api` v1.2.0 / `vc-vault` v0.3.0

Brings the SDK in line with `acta-api` v1.2.0 (which itself aligns with
`vc-vault` v0.3.0 and exposes `vc-issuer-registry`). Major surface
refresh: new methods, typed errors, paginated reads, and React hooks for
every endpoint the API now ships.

> **Versioning note.** Strict semver would call most of these changes
> BREAKING and bump to 2.0.0. We are intentionally staying on `1.1.x`
> until the panel and other internal consumers have migrated. **Do not
> publish from this branch.** When the migration is ready, cut a major
> bump in a separate release.

### Removed — BREAKING

- `ActaClient.createCredential` — was already deprecated and threw at
  call time.
- `ActaClient.getDefaults` — was a deprecated alias for `getConfig` that
  also remapped to the legacy `issuanceContractId` / `vaultContractId`
  fields. Use `getConfig()` directly.
- `ActaClient.prepareStoreTx`, `prepareListVcIdsTx`, `prepareGetVcTx`,
  `vaultStore` — were all deprecated wrappers that either threw or
  duplicated `vcIssue` / `vaultListVcIdsDirect` / `vaultGetVcDirect`.
- `ActaClient.vaultMigrate` and the `VaultMigrateResponse` type — the
  corresponding `POST /contracts/vault/migrate` endpoint was removed from
  `acta-api` v1.2.0 (the contract no longer exposes `migrate`).
- `CreateCredentialPayload` / `CreateCredentialResponse` types and the
  `src/types/type.payload.ts` and `src/types/types.response.ts` files.

### Changed — BREAKING

- `ActaClient.vaultListVcIdsDirect` now accepts `offset` and `limit`
  (defaults 0 / 50, max 200 = `MAX_LIST_LIMIT`). The API endpoint became
  paginated in `acta-api` v1.2.0; calls without these args used to
  succeed; from this release they hit the paginated path.
- `ActaClient.revokeCredentialViaApi` now requires `owner: string` in
  prepare mode. The `vc-vault` contract calls `owner.require_auth()`, so
  the vault owner MUST sign the prepared XDR (relayer signatures no
  longer satisfy authorisation).
- `useCredential().revoke({ owner, ... })` — same change at the hook
  level. Smart-account (C...) owners are rejected client-side because the
  contract's auth path is not modelled for them yet.
- `VaultVerifyVcResponse.status` is now typed `"valid" | "revoked" |
  "invalid" | "unknown"`. The previous `"valid" | "revoked"` was
  incomplete; the API has returned `"invalid"` since v1.2.0.
- All `ActaClient` methods now reject with `ActaError` on non-2xx
  responses instead of axios's generic error object. The shape exposes
  `code`, `httpStatus`, `requestId`, `retryAfter` and `details`.

### Added

- `ActaClient.vcBatchIssue` — issues up to 5 VCs in one transaction
  (`MAX_BATCH_SIZE = 5`). Mirrors `POST /contracts/vc/batch-issue`.
- `ActaClient.vaultVcCount` — O(1) active-VC count. Pair with
  `vaultListVcIdsDirect` to size pagination without polling for empty
  pages.
- `ActaClient.vaultListAuthorizedIssuers`, `vaultListDeniedIssuers`,
  `vaultAuthorizedIssuerCount`, `vaultDeniedIssuerCount` — per-vault
  issuer lists + O(1) counts.
- `ActaClient.vaultMetadata` — combined vault metadata (`admin`,
  `did_uri`, `revoked`, `vc_count`, `authorized_issuer_count`) in one
  round-trip.
- Issuer-registry methods: `issuerRegistryAdd`, `issuerRegistrySetMetadata`,
  `issuerRegistrySetAllowed`, `issuerRegistryRemove`, `issuerRegistryGet`,
  `issuerRegistryIsAllowed`, `issuerRegistryStatus`. Until
  `vc-issuer-registry` is deployed, these reject with `contractId_invalid`.
- New React hooks:
  - `useCredential().batchIssue(...)` — prepare → sign → submit for up to
    5 VCs.
  - `useVaultRead().vcCount(...)`, `listAllVcIds(...)`, `metadata(...)`.
  - `useVaultIssuers()` — `count`, `countDenied`, `list`, `listDenied`,
    `listAll`, `listAllDenied`.
  - `useIssuerRegistry()` — read (`get`, `isAllowed`, `status`) and admin
    mutations (`add`, `setMetadata`, `setAllowed`, `remove`).
  - `useVault().authorizeIssuers(...)` — bulk variant (validated against
    `MAX_ISSUERS_LIST = 100`).
- `ActaError` typed error class (`src/utils/acta-error.ts`) + the
  `ActaErrorCode` string-literal union of every known API error code
  (vc-vault + vc-issuer-registry + API-side).
- `CONTRACT_LIMITS` constants (`src/utils/contract-limits.ts`): mirror of
  the contract-side caps so UI inputs can validate locally.
- `index.ts` now also re-exports `ActaClient`, `ActaError`,
  `CONTRACT_LIMITS` and their TS types for consumers that want them
  directly.

### Internal

- Response shape `VaultListVcIdsResponse` gained `offset` and `limit`
  echo fields.
- New shapes: `VaultVcCountResponse`, `VaultIssuerListResponse`,
  `VaultIssuerCountResponse`, `VaultMetadataResponse`, `VcBatchIssueResponse`,
  `IssuerRecord`, `IssuerRegistry*Response`.
- `useCredential` hook lost its `useCreateCredential` parity; the deleted
  legacy helpers were never wired to a hook anyway.

### Migration guide

1. Stop importing the removed methods (`createCredential`,
   `prepareStoreTx`, `prepareListVcIdsTx`, `prepareGetVcTx`, `vaultStore`,
   `getDefaults`, `vaultMigrate`).
2. Pass `owner` to `revokeCredentialViaApi` / `useCredential().revoke`,
   and ensure the resulting XDR is signed by that owner.
3. If you call `vaultListVcIdsDirect`, accept the new defaults (`offset=0`,
   `limit=50`) or pass explicit values. For full lists, prefer
   `useVaultRead().listAllVcIds(...)`.
4. Catch `ActaError` and branch on `err.code` instead of parsing
   `err.response?.data`.
5. Narrow `verifyVc` results against the new `"invalid"` / `"unknown"`
   variants when using TypeScript's strictness.

## [1.1.1] - 2026-05-07

First release under the new package name. Previously published as
[`@acta-team/acta-sdk`](https://www.npmjs.com/package/@acta-team/acta-sdk),
which is now deprecated.

> **Migration:** replace `@acta-team/acta-sdk` with `@acta-team/credentials` in
> your `package.json`. The public hooks (`useVault`, `useVaultRead`,
> `useCredential`) and provider (`ActaConfig`) keep the same names and import
> paths.

### Highlights

- **New package name** `@acta-team/credentials`. The old package is deprecated.
- **API alignment** with the latest ACTA backend:
  - `vcIssue` no longer accepts `holder`. The holder is expressed inside
    `vcData` (typically `credentialSubject.id`) following W3C VC 2.0.
  - `sourcePublicKey` is optional for vault owners that are smart accounts
    (`C...`) — the backend uses the relayer automatically.
- **Linked credentials:**
  - New client method `vcIssueLinked` and hook `useCredential().issueLinked`
    for `POST /contracts/vc/issue-linked`.
  - New client method `vaultGetVcParent` and hook
    `useVaultRead().getVcParent` for `POST /contracts/vault/get-vc-parent`.
- **Types:** added `VcIssueLinkedResponse`, `VaultGetVcParentResponse`,
  `VaultVcParentInfo`.
- **CI:** the package is now published from GitHub Actions with
  [npm provenance](https://docs.npmjs.com/generating-provenance-statements).

### Breaking changes

- `vcIssue({ ..., holder })` is no longer supported. Move the holder into
  `vcData` (typically `credentialSubject.id`).

### Install

```bash
npm install @acta-team/credentials
```

### Links

- npm: <https://www.npmjs.com/package/@acta-team/credentials>
- Repo: <https://github.com/ACTA-Team/acta-credentials>

[1.1.1]: https://github.com/ACTA-Team/acta-credentials/releases/tag/v1.1.1
