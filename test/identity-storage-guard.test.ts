// The guard under test refuses to register a DID on storage that dies with
// the process. These tests must therefore prove a NEGATIVE — that nothing was
// signed and nothing was submitted — so the chain layer is mocked with spies
// rather than stubbed away.
jest.mock("@acta-team/did-stellar", () => ({
  buildDidStellar: (network: string, id: string) => `did:stellar:${network}:${id}`,
  encodeMultikey: (_type: string, publicKey: Uint8Array) =>
    `z${Buffer.from(publicKey).toString("hex")}`,
  generateDidId: () => "abcdefghijklmnopqrstuvwxyz",
  prepareRegisterDidXdr: jest.fn(async () => ({
    xdr: "UNSIGNED_XDR",
    networkPassphrase: "Test SDF Network ; September 2015",
  })),
  submitSignedXdr: jest.fn(async () => ({})),
}));

jest.mock("@noble/ed25519", () => {
  let counter = 0;
  return {
    utils: { randomPrivateKey: () => new Uint8Array(32).fill(++counter & 0xff) },
    getPublicKeyAsync: async (priv: Uint8Array) => Uint8Array.from(priv, (b) => b ^ 0xff),
  };
});

import { prepareRegisterDidXdr, submitSignedXdr } from "@acta-team/did-stellar";

import { ActaClient } from "../src/client";
import {
  EphemeralIssuerStorageError,
  InMemoryIssuerIdentityStorage,
  IssuerIdentityProvider,
} from "../src/identity";
import type { IssuerIdentity, IssuerIdentityStorage } from "../src/identity";

const TESTNET = "https://api.testnet.acta.build";
const CONTROLLER = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBAAAA";

/** A backend that outlives the process, as far as the provider can tell. */
class DurableStorage implements IssuerIdentityStorage {
  readonly records = new Map<string, IssuerIdentity>();

  async get(controller: string, network: string): Promise<IssuerIdentity | null> {
    return this.records.get(`${network}:${controller}`) ?? null;
  }

  async set(identity: IssuerIdentity, network: string): Promise<void> {
    this.records.set(`${network}:${identity.controller}`, identity);
  }
}

const sign = async (xdr: string) => `SIGNED(${xdr})`;

/**
 * The suite runs under `testEnvironment: "node"`, so `autoSelectStorage()`
 * always lands on the in-memory map — exactly the server-side default the
 * guard exists for. Assert that rather than trusting the environment.
 */
beforeEach(() => {
  expect((globalThis as { indexedDB?: unknown }).indexedDB).toBeUndefined();
  (prepareRegisterDidXdr as jest.Mock).mockClear();
  (submitSignedXdr as jest.Mock).mockClear();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("IssuerIdentityProvider refuses the volatile default", () => {
  it("throws instead of registering a DID it will forget on restart", async () => {
    const provider = new IssuerIdentityProvider({ network: "testnet" });
    const signer = jest.fn(sign);

    await expect(
      provider.getOrCreate({ controller: CONTROLLER, signTransaction: signer })
    ).rejects.toBeInstanceOf(EphemeralIssuerStorageError);

    // The whole point is that it stops BEFORE anything irreversible: no
    // wallet prompt, no prepared XDR, no submission.
    expect(signer).not.toHaveBeenCalled();
    expect(prepareRegisterDidXdr).not.toHaveBeenCalled();
    expect(submitSignedXdr).not.toHaveBeenCalled();
  });

  it("carries a stable code and names both ways out", async () => {
    let thrown: unknown;
    try {
      await new IssuerIdentityProvider({ network: "testnet" }).getOrCreate({
        controller: CONTROLLER,
        signTransaction: sign,
      });
    } catch (e) {
      thrown = e;
    }

    const error = thrown as EphemeralIssuerStorageError;
    expect(error.name).toBe("EphemeralIssuerStorageError");
    expect(error.code).toBe("ephemeral_issuer_storage");
    // A developer hitting this mid-deploy should not have to read the source.
    expect(error.message).toContain("storage");
    expect(error.message).toContain("allowEphemeralStorage");
  });

  it("still answers read-only lookups without throwing", async () => {
    // `get()` cannot orphan anything — it only ever reports what is stored.
    // Failing it too would break the "have I onboarded yet?" check.
    await expect(
      new IssuerIdentityProvider({ network: "testnet" }).get(CONTROLLER)
    ).resolves.toBeNull();
  });
});

describe("IssuerIdentityProvider honours an explicit choice", () => {
  it("registers when the integrator hands in the in-memory backend", async () => {
    const provider = new IssuerIdentityProvider({
      network: "testnet",
      storage: new InMemoryIssuerIdentityStorage(),
    });

    const identity = await provider.getOrCreate({
      controller: CONTROLLER,
      signTransaction: sign,
    });

    expect(identity.did).toBe("did:stellar:testnet:abcdefghijklmnopqrstuvwxyz");
    expect(submitSignedXdr).toHaveBeenCalledTimes(1);
  });

  it("registers on the volatile default once allowEphemeralStorage is set", async () => {
    const provider = new IssuerIdentityProvider({
      network: "testnet",
      allowEphemeralStorage: true,
    });

    await expect(
      provider.getOrCreate({ controller: CONTROLLER, signTransaction: sign })
    ).resolves.toMatchObject({ controller: CONTROLLER });
  });

  it("registers against a durable backend and persists the identity there", async () => {
    const storage = new DurableStorage();
    const provider = new IssuerIdentityProvider({ network: "testnet", storage });

    const identity = await provider.getOrCreate({
      controller: CONTROLLER,
      signTransaction: sign,
    });

    expect(storage.records.get(`testnet:${CONTROLLER}`)).toEqual(identity);
  });

  it("does not second-guess a custom backend that declares itself ephemeral", async () => {
    // Passing one in is a decision; the guard only catches the default.
    const storage: IssuerIdentityStorage = Object.assign(new DurableStorage(), {
      isEphemeral: true,
    });

    await expect(
      new IssuerIdentityProvider({ network: "testnet", storage }).getOrCreate({
        controller: CONTROLLER,
        signTransaction: sign,
      })
    ).resolves.toMatchObject({ controller: CONTROLLER });
  });
});

describe("ActaClient wiring", () => {
  it("refuses to onboard an issuer identity with the default storage", async () => {
    const client = new ActaClient(TESTNET as never, "test-key");

    await expect(
      client.getOrCreateIssuerIdentity({
        controller: CONTROLLER,
        signTransaction: sign,
      })
    ).rejects.toBeInstanceOf(EphemeralIssuerStorageError);
  });

  it("passes allowEphemeralStorage through to the provider", async () => {
    const client = new ActaClient(TESTNET as never, "test-key", {
      allowEphemeralStorage: true,
    });

    await expect(
      client.getOrCreateIssuerIdentity({
        controller: CONTROLLER,
        signTransaction: sign,
      })
    ).resolves.toMatchObject({ controller: CONTROLLER });
  });

  it("passes a custom storage through to the provider", async () => {
    const storage = new DurableStorage();
    const client = new ActaClient(TESTNET as never, "test-key", { storage });

    await client.getOrCreateIssuerIdentity({
      controller: CONTROLLER,
      signTransaction: sign,
    });

    expect(storage.records.has(`testnet:${CONTROLLER}`)).toBe(true);
  });
});

describe("storage selection is deferred until the identity layer is used", () => {
  it("stays quiet for consumers that never touch an issuer identity", async () => {
    // `autoSelectStorage()` warns about the volatile fallback, and warns only
    // once per process. Verify-only consumers build a client too, and a
    // warning they can do nothing about is one everyone learns to scroll past.
    // A fresh module registry resets the once-per-process latch.
    jest.isolateModules(() => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const { ActaClient: Fresh } = require("../src/client") as {
        ActaClient: typeof ActaClient;
      };

      const client = new Fresh(TESTNET as never, "test-key");
      expect(warn).not.toHaveBeenCalled();

      // ...but it does warn as soon as the identity layer is actually used.
      void client.getIssuerIdentity(CONTROLLER);
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });
});
