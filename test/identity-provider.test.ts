// Mock the on-chain layer so the test never hits Stellar.
jest.mock("@acta-team/did-stellar", () => ({
  buildDidStellar: (network: string, id: string) => `did:stellar:${network}:${id}`,
  encodeMultikey: () => "zMockMultikey",
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
jest.mock("@noble/ed25519", () => ({
  utils: { randomPrivateKey: () => new Uint8Array(32).fill(0xa5) },
  getPublicKeyAsync: async () => new Uint8Array(32).fill(0x5a),
  getPublicKey: () => {
    throw new Error("hashes.sha512Sync not set");
  },
}));

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
