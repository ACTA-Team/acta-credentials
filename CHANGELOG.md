# Changelog

All notable changes to `@acta-team/credentials` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
