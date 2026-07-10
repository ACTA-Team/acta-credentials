# ACTA Credentials SDK

[![npm](https://img.shields.io/npm/v/%40acta-team%2Fcredentials)](https://www.npmjs.com/package/@acta-team/credentials)

React/TypeScript SDK for [ACTA](https://acta.build): issue, store, verify, and revoke **verifiable credentials on Stellar** through single-tenant vaults, with non-custodial wallet signing and automatic issuer identity (did:stellar) onboarding.

- **Full documentation:** https://docs.acta.build
- **Quickstart (zero to credential):** https://docs.acta.build/quickstart

## Install

```bash
npm install @acta-team/credentials
# or: yarn add / pnpm add
```

Requires React 18 or 19 (peer dependency). Ships ESM + CJS with TypeScript declarations. Subpath exports: `@acta-team/credentials/hooks` and `@acta-team/credentials/types`.

## Quick start

```tsx
import { ActaConfig, testNet } from "@acta-team/credentials";

// Get an API key at https://dapp.acta.build (API Keys section)
export function Providers({ children }) {
  return (
    <ActaConfig baseURL={testNet} apiKey={process.env.NEXT_PUBLIC_ACTA_API_KEY}>
      {children}
    </ActaConfig>
  );
}
```

Issue and verify a credential (your wallet signs; keys never leave the device):

```ts
import { useVault, useCredential, useVaultRead } from "@acta-team/credentials";

const { createVault } = useVault();
const { issue } = useCredential();
const { verifyVc } = useVaultRead();

await createVault({ owner, ownerDid, signTransaction });

await issue({
  owner,
  vcId: "badge-001",
  vcData: {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    type: ["VerifiableCredential"],
    credentialSubject: { id: holderDid, name: "Ada Lovelace" },
  },
  issuer,
  signTransaction,
  // issuerDid can be omitted: the SDK auto-registers a did:stellar
  // for the issuer with one wallet signature and reuses it afterwards.
});

const status = await verifyVc({ owner, vcId: "badge-001" });
// { status: "valid", since: "..." }
```

`signTransaction` is any wallet callback `(xdr, { networkPassphrase }) => Promise<signedXdr>` (Freighter, Albedo, WalletConnect...).

## What's inside

| Export | Purpose |
|--------|---------|
| `ActaConfig` / `useActaClient` | Provider and direct access to the HTTP client |
| `useVault` | `createVault`, `denyIssuer`, `allowIssuer` (issuance is open by default; owners block by exception) |
| `useCredential` | `issue`, `revoke` |
| `useVaultRead` | `listVcIds`, `getVc`, `verifyVc` |
| `ActaClient` | Everything else: `getConfig`, `vaultSetDid`, `vaultPush`, `vaultSetNewOwner`, `sponsoredVaultCreate`, identity APIs |
| `ActaApiError` / `normalizeError` | Typed errors with stable `code`s, 30s timeouts |
| `mainNet` / `testNet` | Base URL constants (`https://api.{network}.acta.build`); custom URLs accepted |

API keys resolve from the `apiKey` prop or env (`ACTA_API_KEY_MAINNET` / `ACTA_API_KEY_TESTNET` / `ACTA_API_KEY`) and are sent as `X-ACTA-Key`.

## Fees & networks

Issuance charges an on-chain fee paid by the issuer: **1 USDC per credential on mainnet** (USDC trustline required), **5 XLM on testnet**. Vaults, DIDs, and API keys are per network.

## Reference

- [SDK reference](https://docs.acta.build/sdk-overview) · [ActaClient](https://docs.acta.build/actaClient)
- [API reference](https://docs.acta.build/api-overview) · [Errors](https://docs.acta.build/api-errors)
- [did:stellar](https://docs.acta.build/did-overview) · [Going to mainnet](https://docs.acta.build/mainnet-guide)
- [Security & data model](https://docs.acta.build/security)

## License

MIT License - see the LICENSE file for details.
