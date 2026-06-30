/**
 * `IssuerIdentityProvider` — orchestrator that turns a Stellar controller
 * account into a fully-registered `did:stellar` issuer identity.
 *
 * The first time it's asked for an identity for a given controller, it:
 *  1. Generates a fresh Ed25519 keypair using `@noble/ed25519`.
 *  2. Encodes the public key as Multikey via `@acta-team/did-stellar`.
 *  3. Builds a `DidRecord` with the same key in `authentication` and
 *     `assertionMethod` (one key, two roles, simplest setup).
 *  4. Calls `prepareRegisterDidXdr` to obtain an unsigned XDR.
 *  5. Asks the integrator's `Signer` to sign with the controller wallet.
 *  6. Submits the signed XDR through Stellar RPC.
 *  7. Persists the identity in the configured storage backend.
 *
 * On subsequent calls for the same controller, it just returns the
 * stored identity — no chain interaction, no signing prompt.
 */

import * as ed25519 from "@noble/ed25519";
import {
  buildDidStellar,
  encodeMultikey,
  generateDidId,
  prepareRegisterDidXdr,
  submitSignedXdr,
} from "@acta-team/did-stellar";

import { autoSelectStorage } from "./storage";

import type { IssuerIdentity, IssuerIdentityStorage, Signer } from "./types";

export interface IssuerIdentityProviderOptions {
  /** Stellar network the issuer DID will be registered on. */
  readonly network: "mainnet" | "testnet";

  /**
   * Storage backend for issuer identities. Defaults to IndexedDB in
   * browsers and in-memory in Node.
   */
  readonly storage?: IssuerIdentityStorage;

  /** Override the Stellar RPC URL used to submit the register transaction. */
  readonly rpcUrl?: string;

  /** Override the `did-stellar-registry` contract ID. */
  readonly registryContractId?: string;

  /** Allow `http://` RPC URLs (dev only). */
  readonly allowHttp?: boolean;
}

export interface GetOrCreateOptions {
  /**
   * Stellar controller account (`G...`). Becomes the on-chain owner of
   * the DID and the default source for the registration transaction.
   */
  readonly controller: string;

  /**
   * Signer for the registration transaction. Only invoked the first
   * time the identity is created — subsequent calls are pure storage
   * reads.
   */
  readonly signTransaction: Signer;
}

export class IssuerIdentityProvider {
  private readonly storage: IssuerIdentityStorage;
  private readonly network: "mainnet" | "testnet";
  private readonly rpcUrl: string | undefined;
  private readonly registryContractId: string | undefined;
  private readonly allowHttp: boolean | undefined;

  constructor(options: IssuerIdentityProviderOptions) {
    this.network = options.network;
    this.storage = options.storage ?? autoSelectStorage();
    this.rpcUrl = options.rpcUrl;
    this.registryContractId = options.registryContractId;
    this.allowHttp = options.allowHttp;
  }

  /**
   * Return a usable issuer identity for the given controller. Creates
   * and registers a new DID if one doesn't exist yet.
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

  private async createAndRegister(args: GetOrCreateOptions): Promise<IssuerIdentity> {
    // 1. Generate a new Ed25519 keypair (used for both `authentication`
    //    and `assertionMethod` — single key, two roles).
    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = await ed25519.getPublicKey(privateKey);
    const publicKeyMultibase = encodeMultikey("Ed25519", publicKey);

    // 2. Mint a fresh opaque DID identifier.
    const didId = generateDidId();
    const did = buildDidStellar(this.network, didId);

    // 3. Prepare the on-chain `register` invocation.
    const prepared = await prepareRegisterDidXdr({
      did,
      sourcePublicKey: args.controller,
      record: {
        controller: args.controller,
        authentication: [{ publicKeyMultibase }],
        assertionMethod: [{ publicKeyMultibase }],
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
      assertionPublicKeyMultibase: publicKeyMultibase,
      assertionPrivateKeyHex: bytesToHex(privateKey),
      assertionPublicKeyHex: bytesToHex(publicKey),
    };
    await this.storage.set(identity, this.network);
    return identity;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] as number).toString(16).padStart(2, "0");
  }
  return out;
}
