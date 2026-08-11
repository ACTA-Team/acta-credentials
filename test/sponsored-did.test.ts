// Mock the on-chain layer so these tests never hit Stellar.
jest.mock("@acta-team/did-stellar", () => ({
  buildDidStellar: (network: string, id: string) =>
    `did:stellar:${network}:${id}`,
  // Derive the encoding from the key bytes, like the real implementation: a
  // constant stub would hide distinct keys colliding into one multibase.
  encodeMultikey: (_type: string, publicKey: Uint8Array) =>
    `z${Buffer.from(publicKey).toString("hex")}`,
  generateDidId: () => "abcdefghijklmnopqrstuvwxyz",
}));

// Mock @noble/ed25519 (ESM-only). The sync `getPublicKey` throws the exact
// error the real v2 package raises, so a regression to the sync variant fails
// here. Each `randomPrivateKey()` yields a different key, as a real CSPRNG
// does — a constant stub would mask the distinct-key requirement.
jest.mock("@noble/ed25519", () => {
  let counter = 0;
  return {
    utils: {
      randomPrivateKey: () => new Uint8Array(32).fill(++counter & 0xff),
    },
    getPublicKeyAsync: async (priv: Uint8Array) =>
      Uint8Array.from(priv, (b) => b ^ 0xff),
    getPublicKey: () => {
      throw new Error("hashes.sha512Sync not set");
    },
  };
});

import {
  buildSponsoredDidRecord,
  generateSponsoredDid,
  generateSponsoredDidKeys,
} from "../src/identity/sponsored-did";

const SPONSOR = "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCAAAA";
const CONTROLLER = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBAAAA";

describe("generateSponsoredDid", () => {
  it("builds a canonical did:stellar for the given network", () => {
    expect(generateSponsoredDid("testnet")).toBe(
      "did:stellar:testnet:abcdefghijklmnopqrstuvwxyz"
    );
    expect(generateSponsoredDid("mainnet")).toBe(
      "did:stellar:mainnet:abcdefghijklmnopqrstuvwxyz"
    );
  });
});

describe("generateSponsoredDidKeys", () => {
  it("returns two DISTINCT keys (the registry rejects reuse with duplicate_key)", async () => {
    const keys = await generateSponsoredDidKeys();

    expect(keys.authentication.publicKeyMultibase).not.toBe(
      keys.assertionMethod.publicKeyMultibase
    );
    expect(keys.authentication.privateKeyHex).not.toBe(
      keys.assertionMethod.privateKeyHex
    );
  });

  it("uses the async getPublicKeyAsync, not the sync variant", async () => {
    // The sync mock throws "hashes.sha512Sync not set"; reaching here proves
    // the async path was taken.
    await expect(generateSponsoredDidKeys()).resolves.toBeDefined();
  });

  it("emits hex private keys and multibase public keys", async () => {
    const keys = await generateSponsoredDidKeys();
    expect(keys.authentication.privateKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(keys.authentication.publicKeyMultibase).toMatch(/^z[0-9a-f]+$/);
  });
});

describe("buildSponsoredDidRecord", () => {
  it("puts each key in exactly one verification relationship", async () => {
    const keys = await generateSponsoredDidKeys();
    const record = buildSponsoredDidRecord({ controller: CONTROLLER, keys });

    expect(record.controller).toBe(CONTROLLER);
    expect(record.authentication).toHaveLength(1);
    expect(record.assertionMethod).toHaveLength(1);
    expect(record.authentication[0]!.publicKeyMultibase).not.toBe(
      record.assertionMethod![0]!.publicKeyMultibase
    );
  });

  it("omits metadata fields when not supplied", async () => {
    const keys = await generateSponsoredDidKeys();
    const record = buildSponsoredDidRecord({ controller: CONTROLLER, keys });

    // The contract rejects a hash without a URI, so neither may be emitted
    // as an explicit undefined.
    expect("metadataUri" in record).toBe(false);
    expect("metadataHash" in record).toBe(false);
  });

  it("carries services through", async () => {
    const keys = await generateSponsoredDidKeys();
    const record = buildSponsoredDidRecord({
      controller: CONTROLLER,
      keys,
      services: [
        {
          idSuffix: "profile",
          serviceType: "LinkedDomains",
          serviceEndpoint: "https://example.com",
        },
      ],
    });

    expect(record.services).toHaveLength(1);
    expect(record.services![0]!.idSuffix).toBe("profile");
  });

  it("never makes the sponsor the controller", async () => {
    // Guard on the sponsored flow's whole point: the record names the subject,
    // not the payer. The contract rejects sponsor == controller with #22.
    const keys = await generateSponsoredDidKeys();
    const record = buildSponsoredDidRecord({ controller: CONTROLLER, keys });
    expect(record.controller).not.toBe(SPONSOR);
  });
});
