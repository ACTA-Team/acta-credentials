// `client.ts` pulls in the identity provider, which imports the ESM-only
// @noble/ed25519. Stub it so Jest's CJS runtime can load the module graph;
// none of these tests touch key generation.
jest.mock("@noble/ed25519", () => ({
  utils: { randomPrivateKey: () => new Uint8Array(32) },
  getPublicKeyAsync: async (priv: Uint8Array) => priv,
}));

import { ActaClient } from "../src/client";
import { ActaApiError } from "../src/errors";
import type { ConfigResponse } from "../src/types/api-responses";

const MAINNET = "https://api.mainnet.acta.build";
const TESTNET = "https://api.testnet.acta.build";

const SPONSOR = "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCAAAA";
const CONTROLLER = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBAAAA";
const DID = "did:stellar:testnet:abcdefghijklmnopqrstuvwxyz";

const RECORD = {
  controller: CONTROLLER,
  authentication: [{ publicKeyMultibase: "z6Mkauth" }],
  assertionMethod: [{ publicKeyMultibase: "z6Mkassert" }],
};

function client(baseURL: string, config?: Partial<ConfigResponse>) {
  const c = new ActaClient(baseURL as never, "test-key");
  jest.spyOn(c, "getConfig").mockResolvedValue({
    rpcUrl: "https://rpc.example",
    networkPassphrase: "Test SDF Network ; September 2015",
    actaContractId: "C".repeat(56),
    ...config,
  } as ConfigResponse);
  return c;
}

/** Replace the internal axios instance so no request leaves the process. */
function stubPost(c: ActaClient, data: unknown) {
  const post = jest.fn().mockResolvedValue({ data });
  (c as unknown as { axios: { post: unknown } }).axios.post = post;
  return post;
}

describe("supportsSponsoredDidRegistration", () => {
  it("trusts the /config capability flag when present", async () => {
    await expect(
      client(TESTNET, { didRegisterSponsoredSupported: true }).supportsSponsoredDidRegistration()
    ).resolves.toBe(true);

    await expect(
      client(TESTNET, { didRegisterSponsoredSupported: false }).supportsSponsoredDidRegistration()
    ).resolves.toBe(false);
  });

  it("falls back to the network name when the API predates the flag", async () => {
    // Older APIs omit the field entirely; the entrypoint has only ever
    // existed on testnet, so the network name is the correct fallback.
    await expect(
      client(TESTNET).supportsSponsoredDidRegistration()
    ).resolves.toBe(true);
    await expect(
      client(MAINNET).supportsSponsoredDidRegistration()
    ).resolves.toBe(false);
  });

  it("falls back to the network name when /config is unreachable", async () => {
    const c = new ActaClient(TESTNET as never, "test-key");
    jest.spyOn(c, "getConfig").mockRejectedValue(new Error("offline"));
    await expect(c.supportsSponsoredDidRegistration()).resolves.toBe(true);
  });
});

describe("registerSponsoredDid", () => {
  it("refuses on mainnet without issuing a request", async () => {
    const c = client(MAINNET, { didRegisterSponsoredSupported: false });
    const post = stubPost(c, {});

    const err = await c
      .registerSponsoredDid({ sponsor: SPONSOR, did: DID, record: RECORD })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ActaApiError);
    expect((err as ActaApiError).status).toBe(501);
    expect((err as ActaApiError).code).toBe("register_sponsored_unsupported");
    expect(post).not.toHaveBeenCalled();
  });

  it("posts the prepare payload on testnet", async () => {
    const c = client(TESTNET, { didRegisterSponsoredSupported: true });
    const post = stubPost(c, { xdr: "UNSIGNED_XDR", network: "testnet" });

    const res = await c.registerSponsoredDid({
      sponsor: SPONSOR,
      did: DID,
      record: RECORD,
    });

    expect(post).toHaveBeenCalledWith("/contracts/did/register-sponsored", {
      sponsor: SPONSOR,
      did: DID,
      record: RECORD,
    });
    expect(res).toEqual({ xdr: "UNSIGNED_XDR", network: "testnet" });
  });

  it("posts the signed XDR in submit mode", async () => {
    const c = client(TESTNET, { didRegisterSponsoredSupported: true });
    const post = stubPost(c, { tx_id: "tx_abc" });

    const res = await c.registerSponsoredDid({ signedXdr: "SIGNED_XDR" });

    expect(post).toHaveBeenCalledWith("/contracts/did/register-sponsored", {
      signedXdr: "SIGNED_XDR",
    });
    expect(res).toEqual({ tx_id: "tx_abc" });
  });
});
