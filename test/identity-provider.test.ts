// Mock the on-chain layer so the test never hits Stellar.
jest.mock("@acta-team/did-stellar", () => ({
  buildDidStellar: (network: string, id: string) => `did:stellar:${network}:${id}`,
  // Derive the encoding from the key bytes, like the real implementation:
  // a constant stub would hide distinct keys colliding into one multibase.
  encodeMultikey: (_type: string, publicKey: Uint8Array) =>
    `z${Buffer.from(publicKey).toString("hex")}`,
  generateDidId: () => "abcdefghijklmnopqrstuvwxyz",
  prepareRegisterDidXdr: jest.fn(async () => ({
    xdr: "UNSIGNED_XDR",
    networkPassphrase: "Test SDF Network ; September 2015",
  })),
  submitSignedXdr: jest.fn(async () => ({})),
}));

// Mock @noble/ed25519 (ESM-only). Crucially, the SYNC `getPublicKey` throws the
// exact error the real v2 package raises — so if the provider ever regressed to
// the sync variant (the SDK-01 bug), these tests would fail. The provider must
// call `getPublicKeyAsync`.
// Each `randomPrivateKey()` call must yield a DIFFERENT key, as the real
// CSPRNG does — the provider now derives two keypairs per registration and a
// constant stub would make them indistinguishable.
jest.mock("@noble/ed25519", () => {
  // Counter lives inside the factory: jest hoists `jest.mock` above the
  // module's own declarations, so an outer variable would be in the TDZ.
  let counter = 0;
  return {
    utils: { randomPrivateKey: () => new Uint8Array(32).fill(++counter & 0xff) },
    getPublicKeyAsync: async (priv: Uint8Array) => Uint8Array.from(priv, (b) => b ^ 0xff),
    getPublicKey: () => {
      throw new Error("hashes.sha512Sync not set");
    },
  };
});

import { prepareRegisterDidXdr } from "@acta-team/did-stellar";

import {
  IssuerIdentityProvider,
  InMemoryIssuerIdentityStorage,
} from "../src/identity";

describe("IssuerIdentityProvider.createAndRegister (SDK-01)", () => {
  it("generates a real Ed25519 keypair without the sha512Sync crash", async () => {
    const storage = new InMemoryIssuerIdentityStorage();
    const provider = new IssuerIdentityProvider({ network: "testnet", storage });
    const signer = jest.fn(async (xdr: string) => `SIGNED(${xdr})`);

    const identity = await provider.getOrCreate({
      controller: "GABCDEF",
      signTransaction: signer,
    });

    expect(identity.assertionPrivateKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(identity.assertionPublicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(identity.did).toBe("did:stellar:testnet:abcdefghijklmnopqrstuvwxyz");
    expect(signer).toHaveBeenCalledTimes(1);
  });

  it("returns the persisted identity on subsequent calls (no new signature)", async () => {
    const storage = new InMemoryIssuerIdentityStorage();
    const provider = new IssuerIdentityProvider({ network: "testnet", storage });
    const signer = jest.fn(async (xdr: string) => `SIGNED(${xdr})`);

    const first = await provider.getOrCreate({ controller: "GXYZ", signTransaction: signer });
    const second = await provider.getOrCreate({ controller: "GXYZ", signTransaction: signer });

    expect(second).toEqual(first);
    expect(signer).toHaveBeenCalledTimes(1);
  });
});

describe("IssuerIdentityProvider key separation (duplicate_key #9)", () => {
  beforeEach(() => {
    (prepareRegisterDidXdr as jest.Mock).mockClear();
  });

  it("registers distinct keys in authentication and assertionMethod", async () => {
    const provider = new IssuerIdentityProvider({
      network: "testnet",
      storage: new InMemoryIssuerIdentityStorage(),
    });

    await provider.getOrCreate({
      controller: "GDUPLICATE",
      signTransaction: async (xdr: string) => `SIGNED(${xdr})`,
    });

    const { record } = (prepareRegisterDidXdr as jest.Mock).mock.calls[0][0];

    // The registry rejects the same multibase key across two verification
    // relationships. Reusing one key here is what caused duplicate_key (#9)
    // on every first-time registration.
    expect(record.authentication).toHaveLength(1);
    expect(record.assertionMethod).toHaveLength(1);
    expect(record.authentication[0].publicKeyMultibase).not.toBe(
      record.assertionMethod[0].publicKeyMultibase
    );
  });

  it("persists both private keys so neither registered key is orphaned", async () => {
    const provider = new IssuerIdentityProvider({
      network: "testnet",
      storage: new InMemoryIssuerIdentityStorage(),
    });

    const identity = await provider.getOrCreate({
      controller: "GORPHAN",
      signTransaction: async (xdr: string) => `SIGNED(${xdr})`,
    });

    const { record } = (prepareRegisterDidXdr as jest.Mock).mock.calls[0][0];

    expect(identity.authenticationPrivateKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(identity.assertionPublicKeyMultibase).toBe(
      record.assertionMethod[0].publicKeyMultibase
    );
    expect(identity.authenticationPublicKeyMultibase).toBe(
      record.authentication[0].publicKeyMultibase
    );
  });
});
