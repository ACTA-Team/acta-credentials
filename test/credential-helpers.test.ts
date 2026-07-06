import {
  isValidDidStellar,
  didStellarNetwork,
  normalizeDid,
  ensureContextInVcData,
} from "../src/utils/credential-helpers";

const VALID_TESTNET = "did:stellar:testnet:abcdefghijklmnopqrstuvwxyz";
const VALID_MAINNET = "did:stellar:mainnet:abcdefghijklmnopqrstuvwxyz";

describe("isValidDidStellar / didStellarNetwork", () => {
  it("accepts a well-formed did:stellar", () => {
    expect(isValidDidStellar(VALID_TESTNET)).toBe(true);
    expect(didStellarNetwork(VALID_TESTNET)).toBe("testnet");
    expect(didStellarNetwork(VALID_MAINNET)).toBe("mainnet");
  });

  it("rejects malformed values and returns null network", () => {
    expect(isValidDidStellar("did:pkh:stellar:GABC")).toBe(false);
    expect(isValidDidStellar("GABC")).toBe(false);
    expect(didStellarNetwork("nope")).toBeNull();
  });
});

describe("normalizeDid", () => {
  it("returns the DID unchanged when valid and network matches", () => {
    expect(normalizeDid(VALID_TESTNET, "testnet")).toBe(VALID_TESTNET);
  });

  it("throws on an invalid DID", () => {
    expect(() => normalizeDid("GABC", "testnet")).toThrow(/valid did:stellar/i);
  });

  it("throws on a network mismatch", () => {
    expect(() => normalizeDid(VALID_MAINNET, "testnet")).toThrow(/does not match/i);
  });
});

describe("ensureContextInVcData", () => {
  const CORE = "https://www.w3.org/ns/credentials/v2";

  it("adds the required @context when missing (object input)", () => {
    const out = JSON.parse(ensureContextInVcData({ name: "x" }));
    expect(out["@context"]).toContain(CORE);
    expect(out.name).toBe("x");
  });

  it("adds the required @context when missing (string input)", () => {
    const out = JSON.parse(ensureContextInVcData('{"a":1}'));
    expect(out["@context"]).toContain(CORE);
  });

  it("merges missing required URLs into an existing @context", () => {
    const out = JSON.parse(
      ensureContextInVcData({ "@context": ["https://example.com/ctx"] })
    );
    expect(out["@context"]).toContain("https://example.com/ctx");
    expect(out["@context"]).toContain(CORE);
  });

  it("throws on invalid JSON string", () => {
    expect(() => ensureContextInVcData("{not json")).toThrow(/Invalid JSON/i);
  });
});
