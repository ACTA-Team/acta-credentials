# ACTA Credentials — Quick Guide

React SDK to interact with ACTA API and manage verifiable credentials on Stellar.

## Installation

```bash
npm i @acta-team/credentials
```

## Configuration

### 1. Configure API Key in `.env`

API keys are network-specific. Configure as needed:

```env
# Option 1: Separate API keys (recommended)
ACTA_API_KEY_MAINNET=your-mainnet-api-key
ACTA_API_KEY_TESTNET=your-testnet-api-key
```

**Get your API key:**

- From the dApp: https://dapp.acta.build

### 2. Configure the Provider

```typescript
import { ActaConfig, mainNet, testNet } from '@acta-team/credentials';

// For mainnet
<ActaConfig baseURL={mainNet}>
  <App />
</ActaConfig>

// For testnet
<ActaConfig baseURL={testNet}>
  <App />
</ActaConfig>
```

## Available Hooks

### `useVault()` - Vault Operations

Manage vaults: create, authorize, and revoke issuers.

```typescript
const { createVault, authorizeIssuer, revokeIssuer } = useVault();

// Create vault
await createVault({
  owner: "G...", // Stellar address of the owner
  ownerDid: "did:stellar:...", // DID of the owner
  signTransaction: async (xdr, { networkPassphrase }) => {
    // Sign XDR with your wallet
    return signedXdr;
  },
});

// Authorize issuer
await authorizeIssuer({
  owner: "G...",
  issuer: "G...", // Address of the issuer to authorize
  signTransaction: async (xdr, { networkPassphrase }) => {
    return signedXdr;
  },
});

// Revoke issuer
await revokeIssuer({
  owner: "G...",
  issuer: "G...", // Address of the issuer to revoke
  signTransaction: async (xdr, { networkPassphrase }) => {
    return signedXdr;
  },
});
```

### `useCredential()` - Credential Operations

Issue and revoke verifiable credentials.

```typescript
const { issue, revoke } = useCredential();

// Issue credential
await issue({
  owner: "G...", // Vault owner
  vcId: "credential-123", // Unique credential ID
  vcData: JSON.stringify({
    /* credential data */
  }),
  issuer: "G...", // Issuer address
  issuerDid: "did:stellar:...", // Issuer DID (optional)
  signTransaction: async (xdr, { networkPassphrase }) => {
    return signedXdr;
  },
});

// Revoke credential
await revoke({
  owner: "G...",
  vcId: "credential-123",
  date: new Date().toISOString(), // Optional, defaults to current date
  signTransaction: async (xdr, { networkPassphrase }) => {
    return signedXdr;
  },
});
```

### `useVaultRead()` - Read Operations

Read vault information without signing transactions.

```typescript
const { listVcIds, getVc, verifyVc } = useVaultRead();

// List credential IDs
const vcIds = await listVcIds({
  owner: "G...",
});

// Get credential
const credential = await getVc({
  owner: "G...",
  vcId: "credential-123",
});

// Verify credential status
const verification = await verifyVc({
  owner: "G...",
  vcId: "credential-123",
});
// Returns: { status: "valid" | "revoked", since?: string }
```

### `useSponsoredDid()` - Sponsored DID Registration (testnet only)

Register a `did:stellar` that your organisation **pays for but does not
control**. Only the sponsor signs; the controller owns the DID from version 1,
so there is no window in which the payer holds custody.

Requires `did-stellar-registry` v0.3.0+, which is deployed on testnet. On
mainnet (registry v0.2.0) the call is refused with
`register_sponsored_unsupported`.

```typescript
const { isSupported, generateKeys, registerSponsored } = useSponsoredDid();

if (!(await isSupported())) return; // gate the UI, do not hardcode the network

// Run this on the SUBJECT's side. Only the public multibase values should
// ever reach the sponsor.
const keys = await generateKeys();

const { did, txId } = await registerSponsored({
  sponsor: "G...", // pays and signs
  controller: "G...", // owns the DID; MUST differ from sponsor
  keys,
  signTransaction, // the SPONSOR's wallet
});
```

Two rules the contract cannot enforce for you:

1. **The subject generates the keys.** Verification never consults the
   controller address, so a sponsor holding the private keys would hold
   signing material for an identity it does not own.
2. **Validate `controller` before calling.** It is never proved on-chain, and
   `update`, `transfer_controller` and `deactivate` all require its signature.
   A mistyped address, an address on the wrong network, or an account that
   does not exist produces a permanently immutable record — the only remedy is
   to abandon the DID and register a fresh one.

Sponsoring yourself (`sponsor === controller`) is rejected: it is plain
registration plus a custody window.

## Transaction Flow

All operations that modify state follow this flow:

1. **Prepare**: SDK calls the API to get an unsigned XDR
2. **Sign**: Your application signs the XDR with the user's wallet
3. **Submit**: SDK submits the signed XDR to the API
4. **Confirm**: API returns the transaction `tx_id`

```typescript
// Complete example
const { createVault } = useVault();

try {
  const result = await createVault({
    owner: walletAddress,
    ownerDid: didUri,
    signTransaction: async (unsignedXdr, { networkPassphrase }) => {
      // Sign with your wallet (Freighter, WalletConnect, etc.)
      return await wallet.signTransaction(unsignedXdr, networkPassphrase);
    },
  });

  console.log("Vault created:", result.txId);
} catch (error) {
  console.error("Error:", error.message);
}
```

## Networks

The SDK supports two networks:

```typescript
import { mainNet, testNet } from "@acta-team/credentials";

// Mainnet
mainNet; // "https://api.mainnet.acta.build"

// Testnet
testNet; // "https://api.testnet.acta.build"
```

The network is automatically detected from the `baseURL` and the corresponding API key is used.

## Dynamic Configuration

The SDK automatically fetches network configuration from the API:

- RPC URL
- Network Passphrase
- Contract IDs

You don't need to configure these values manually.

## Complete Example

```typescript
import { ActaConfig, mainNet, useVault, useCredential, useVaultRead } from '@acta-team/credentials';

function App() {
  return (
    <ActaConfig baseURL={mainNet}>
      <MyComponent />
    </ActaConfig>
  );
}

function MyComponent() {
  const { createVault } = useVault();
  const { issue } = useCredential();
  const { listVcIds } = useVaultRead();

  const handleCreateVault = async () => {
    await createVault({
      owner: "G...",
      ownerDid: "did:stellar:...",
      signTransaction: signer
    });
  };

  // ... rest of your code
}
```

## API Keys and Roles

API keys have roles that determine:

- **Endpoint access**: Some endpoints require `admin` role
- **Applied fees**: Each role has different fees (standard, early, custom, admin)

Available roles:

- `admin` - Full access, no fees
- `standard` - Normal access, standard fee
- `early` - Normal access, early fee
- `custom` - Normal access, custom fee

## Support

- Full documentation: See `README.md` in the repository
- Issues: https://github.com/ACTA-Team/acta-api/issues
- dApp: https://dapp.acta.build
