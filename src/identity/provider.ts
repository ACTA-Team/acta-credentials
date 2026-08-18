/**
 * `IssuerIdentityProvider` — orchestrator that turns a Stellar controller
 * account into a fully-registered `did:stellar` issuer identity.
 *
 * The first time it's asked for an identity for a given controller, it:
 *  1. Generates two fresh Ed25519 keypairs using `@noble/ed25519`.
 *  2. Encodes both public keys as Multikey via `@acta-team/did-stellar`.
 *  3. Builds a `DidRecord` with one key in `authentication` and a
 *     DISTINCT key in `assertionMethod`. The registry enforces that a key
 *     appears in at most one verification relationship, so reusing a single
 *     key across both is rejected on-chain with `duplicate_key` (#9).
 *  4. Calls `prepareRegisterDidXdr` to obtain an unsigned XDR.
 *  5. Asks the integrator's `Signer` to sign with the controller wallet.
 *  6. Submits the signed XDR through Stellar RPC.
 *  7. Persists the identity in the configured storage backend.
 *
 * On subsequent calls for the same controller, it just returns the
 * stored identity — no chain interaction, no signing prompt.
 *
 * Step 7 is what makes steps 1-6 a one-time cost, so the provider checks up
 * front that the storage backend can actually hold the identity past this
 * process. If it cannot, and nobody asked for that, registration is refused
 * rather than repeated on every restart — see `EphemeralIssuerStorageError`.
 */

import * as ed25519 from "@noble/ed25519";
import {
  buildDidStellar,
  encodeMultikey,
  generateDidId,
  prepareRegisterDidXdr,
  submitSignedXdr,
} from "@acta-team/did-stellar";

import { autoSelectStorage, EphemeralIssuerStorageError } from "./storage";

import type { IssuerIdentity, IssuerIdentityStorage, Signer } from "./types";

export interface IssuerIdentityProviderOptions {
  /** Stellar network the issuer DID will be registered on. */
  readonly network: "mainnet" | "testnet";

  /**
   * Storage backend for issuer identities. Defaults to IndexedDB in
   * browsers and in-memory everywhere else.
   *
   * On a server the default is a trap — it forgets the identity on every
   * restart — so leaving it unset makes {@link getOrCreate} refuse to
   * register a new DID. Pass a durable backend, or opt into the volatile one
   * with {@link allowEphemeralStorage}.
   */
  readonly storage?: IssuerIdentityStorage;

  /** Override the Stellar RPC URL used to submit the register transaction. */
  readonly rpcUrl?: string;

  /** Override the `did-stellar-registry` contract ID. */
  readonly registryContractId?: string;

  /** Allow `http://` RPC URLs (dev only). */
  readonly allowHttp?: boolean;

  /**
   * Register a DID even though the identity will be stored somewhere that
   * dies with the process. Only relevant when no {@link storage} is passed
   * and the runtime has no durable default (i.e. anything but a browser).
   *
   * Set it for tests, throwaway demos, and short-lived scripts. Setting it on
   * a long-running issuer means accepting a new DID and a new signing key on
   * every restart — see {@link EphemeralIssuerStorageError}.
   */
  readonly allowEphemeralStorage?: boolean;
}

export interface GetOrCreateOptions {
  /**
   * Stellar controller of the DID. Either a classic account (`G...`) or a
   * contract / smart account (`C...`). Becomes the on-chain controller of
   * the DID.
   *
   * When it is a classic `G...` account it also defaults to the source of
   * the registration transaction. A contract (`C...`) cannot be the classic
   * source, so `sourcePublicKey` is REQUIRED in that case (see below).
   */
  readonly controller: string;

  /**
   * Classic Stellar account (`G...`) that funds/sources the registration
   * transaction. Required when `controller` is a contract (`C...`), which
   * cannot itself be the classic transaction source — pass a funded account
   * or a relayer public key here. Optional (defaults to `controller`) when
   * the controller is a classic `G...` account.
   */
  readonly sourcePublicKey?: string;

  /**
   * Signer for the registration transaction. Only invoked the first
   * time the identity is created — subsequent calls are pure storage
   * reads.
   */
  readonly signTransaction: Signer;
}

/** Whether a strkey is a Soroban contract address (`C...`). */
function isContractAddress(address: string): boolean {
  return typeof address === "string" && address.startsWith("C");
}

export class IssuerIdentityProvider {
  /** Backend the integrator passed in, or `undefined` if they passed none. */
  private readonly explicitStorage: IssuerIdentityStorage | undefined;
  /** Memoized result of {@link autoSelectStorage}, resolved on first use. */
  private autoStorage: IssuerIdentityStorage | undefined;
  private readonly network: "mainnet" | "testnet";
  private readonly rpcUrl: string | undefined;
  private readonly registryContractId: string | undefined;
  private readonly allowHttp: boolean | undefined;
  private readonly allowEphemeralStorage: boolean;

  constructor(options: IssuerIdentityProviderOptions) {
    this.network = options.network;
    this.explicitStorage = options.storage;
    this.rpcUrl = options.rpcUrl;
    this.registryContractId = options.registryContractId;
    this.allowHttp = options.allowHttp;
    this.allowEphemeralStorage = options.allowEphemeralStorage ?? false;
  }

  /**
   * The backend in use, picking a runtime default the first time it is
   * needed.
   *
   * Resolved lazily on purpose: `autoSelectStorage()` warns when it falls
   * back to the in-memory map, and `ActaClient` builds a provider for every
   * consumer — including the many that only verify credentials and never
   * touch an issuer identity. Selecting eagerly would fire that warning at
   * them, and a warning everyone learns to ignore protects nobody.
   */
  private get storage(): IssuerIdentityStorage {
    if (this.explicitStorage) return this.explicitStorage;
    if (!this.autoStorage) this.autoStorage = autoSelectStorage();
    return this.autoStorage;
  }

  /**
   * Return a usable issuer identity for the given controller. Creates
   * and registers a new DID if one doesn't exist yet.
   *
   * @throws {EphemeralIssuerStorageError} when a new DID would have to be
   * registered against storage that does not survive a process restart and
   * the integrator never chose that backend. Nothing is signed or submitted.
   */
  async getOrCreate(args: GetOrCreateOptions): Promise<IssuerIdentity> {
    const existing = await this.storage.get(args.controller, this.network);
    if (existing) return existing;

    return this.createAndRegister(args);
  }

  /**
   * Look up an existing identity without creating one. Returns `null`
   * if none has been persisted for this controller.
   */
  async get(controller: string): Promise<IssuerIdentity | null> {
    return this.storage.get(controller, this.network);
  }

  /**
   * Refuse to mint a DID that the next restart will silently replace.
   *
   * Only fires for a backend the SDK chose by itself: an ephemeral one the
   * integrator handed in is a decision, and decisions are honoured. Runs
   * before key generation, before the signature prompt, and before any RPC
   * call, so nothing on-chain happens and no wallet popup appears.
   */
  private assertStorageOutlivesProcess(): void {
    if (this.allowEphemeralStorage) return;
    if (this.explicitStorage !== undefined) return;
    if (this.storage.isEphemeral !== true) return;
    throw new EphemeralIssuerStorageError();
  }

  private async createAndRegister(args: GetOrCreateOptions): Promise<IssuerIdentity> {
    // 0. Bail out before doing anything irreversible if the identity we are
    //    about to create would not survive this process.
    this.assertStorageOutlivesProcess();

    // 1. Generate two independent Ed25519 keypairs: one for
    //    `assertionMethod` (signs credentials) and one for `authentication`.
    //    They MUST be distinct — the registry rejects a record that reuses
    //    the same key across verification relationships.
    const assertion = await generateEd25519Key();
    const authentication = await generateEd25519Key();

    // Defensive: a collision here means the RNG is broken (or stubbed).
    // Registering anyway would fail on-chain with an opaque duplicate_key.
    if (assertion.publicKeyMultibase === authentication.publicKeyMultibase) {
      throw new Error(
        "Generated identical authentication and assertion keys; the runtime " +
          "CSPRNG appears to be broken. Refusing to register the DID."
      );
    }

    // 2. Mint a fresh opaque DID identifier.
    const didId = generateDidId();
    const did = buildDidStellar(this.network, didId);

    // 3. Prepare the on-chain `register` invocation.
    //    The transaction source must be a classic `G...` account. When the
    //    controller is itself a `G...` account it doubles as the source;
    //    when the controller is a contract (`C...`) it cannot sign a classic
    //    envelope, so an explicit `sourcePublicKey` (funder / relayer) is
    //    required. The contract's `controller.require_auth()` is satisfied by
    //    the smart account through the integrator's signer.
    if (isContractAddress(args.controller) && !args.sourcePublicKey) {
      throw new Error(
        "sourcePublicKey is required when controller is a contract (C...): " +
          "a contract cannot be the classic transaction source; pass a funded " +
          "G... account or relayer public key."
      );
    }
    const sourcePublicKey = args.sourcePublicKey ?? args.controller;

    const prepared = await prepareRegisterDidXdr({
      did,
      sourcePublicKey,
      record: {
        controller: args.controller,
        authentication: [{ publicKeyMultibase: authentication.publicKeyMultibase }],
        assertionMethod: [{ publicKeyMultibase: assertion.publicKeyMultibase }],
        keyAgreement: [],
        services: [],
      },
      ...(this.rpcUrl ? { rpcUrl: this.rpcUrl } : {}),
      ...(this.registryContractId ? { registryContractId: this.registryContractId } : {}),
      ...(this.allowHttp ? { allowHttp: this.allowHttp } : {}),
    });

    // 4. Let the integrator sign with the controller wallet.
    const signedXdr = await args.signTransaction(prepared.xdr, {
      networkPassphrase: prepared.networkPassphrase,
    });

    // 5. Submit through Stellar RPC and wait for confirmation.
    await submitSignedXdr({
      signedXdr,
      network: this.network,
      ...(this.rpcUrl ? { rpcUrl: this.rpcUrl } : {}),
      ...(this.allowHttp ? { allowHttp: this.allowHttp } : {}),
    });

    // 6. Materialize the identity and persist it.
    const identity: IssuerIdentity = {
      did,
      controller: args.controller,
      assertionPublicKeyMultibase: assertion.publicKeyMultibase,
      assertionPrivateKeyHex: bytesToHex(assertion.privateKey),
      assertionPublicKeyHex: bytesToHex(assertion.publicKey),
      authenticationPublicKeyMultibase: authentication.publicKeyMultibase,
      authenticationPrivateKeyHex: bytesToHex(authentication.privateKey),
      authenticationPublicKeyHex: bytesToHex(authentication.publicKey),
    };
    await this.storage.set(identity, this.network);
    return identity;
  }
}

interface GeneratedKey {
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly publicKeyMultibase: string;
}

/**
 * Generate one Ed25519 keypair and its Multikey encoding.
 *
 * Uses the async `getPublicKeyAsync`: the sync `getPublicKey` throws
 * "hashes.sha512Sync not set" in @noble/ed25519 v2 unless a sync SHA-512 is
 * configured, which the SDK does not do.
 */
async function generateEd25519Key(): Promise<GeneratedKey> {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  return {
    privateKey,
    publicKey,
    publicKeyMultibase: encodeMultikey("Ed25519", publicKey),
  };
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] as number).toString(16).padStart(2, "0");
  }
  return out;
}
