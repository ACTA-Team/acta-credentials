import { networkFromBaseUrl } from "../src/utils/network-from-base-url";

// The network is inferred from the host, and getting it wrong is silent: the
// client would talk to the wrong DID registry and read the wrong API key
// variable without ever raising. A host rename already broke this once, when
// `production-api` stopped matching a bare `includes("mainnet")` check.
describe("networkFromBaseUrl", () => {
  it("resolves the current hosts", () => {
    expect(networkFromBaseUrl("https://production-api.acta.build")).toBe("mainnet");
    expect(networkFromBaseUrl("https://sandbox-api.acta.build")).toBe("testnet");
  });

  it("still resolves the legacy hosts", () => {
    expect(networkFromBaseUrl("https://api.mainnet.acta.build")).toBe("mainnet");
    expect(networkFromBaseUrl("https://api.testnet.acta.build")).toBe("testnet");
  });

  it("ignores case", () => {
    expect(networkFromBaseUrl("https://PRODUCTION-API.ACTA.BUILD")).toBe("mainnet");
  });

  // Guessing mainnet for an unknown host would mean issuing against the real
  // chain by accident. Guessing testnet costs a rejected request.
  it("falls back to testnet for anything unrecognised", () => {
    expect(networkFromBaseUrl("http://localhost:8000")).toBe("testnet");
    expect(networkFromBaseUrl("https://staging.example.com")).toBe("testnet");
    expect(networkFromBaseUrl("")).toBe("testnet");
    expect(networkFromBaseUrl(undefined as unknown as string)).toBe("testnet");
  });
});
