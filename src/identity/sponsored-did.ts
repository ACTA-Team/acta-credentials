/**
 * Sponsored `did:stellar` registration.
 *
 * An organisation pays for a user's DID without ever controlling it. Only the
 * sponsor signs; `record.controller` owns the DID from version 1, so the payer
 * never holds custody. Backed by `did-stellar-registry.register_sponsored`
 * (registry v0.3.0, contracts-acta#82) through
 * `POST /contracts/did/register-sponsored`.
 *
 * **Testnet only.** Mainnet still runs registry v0.2.0, where the entrypoint
 * does not exist. The client checks `GET /config` →
 * `didRegisterSponsoredSupported` before spending a round-trip, and falls back
 * to the network name on API versions that predate the flag.
 *
 * ## Who generates the keys
 *
 * The **subject**, not the sponsor. The registry never proves the controller
 * address and never consults it during verification, so a sponsor that
 * generated the keys would hold signing material for an identity it does not
 * own. {@link generateSponsoredDidKeys} exists so the subject's side can
 * produce a conforming key pair set; the sponsor should only ever receive the
 * public multibase values.
 *
 * ## The controller address is unrecoverable if wrong
 *
 * `update`, `transfer_controller` and `deactivate` all require the
 * controller's signature. A record written with a mistyped address, an address
 * on the wrong network, or an account that does not exist can never be
 * mutated, transferred or retired — the only remedy is to abandon the DID and
 * register a fresh one. Validate the address off-chain first. See the
 * did:stellar spec §4.4.2.
 */

import * as ed25519 from "@noble/ed25519";
import {
  buildDidStellar,
  encodeMultikey,
  generateDidId,
} from "@acta-team/did-stellar";

/** Single public-key entry, in W3C Multikey form. */
export interface SponsoredDidKey {
  /** Multikey string, e.g. `z6Mk...` (Ed25519). */
  readonly publicKeyMultibase: string;
}

/** A service endpoint published in the DID Document. */
export interface SponsoredDidService {
  /** Lowercase alphanumeric plus hyphen. Used as `{did}#service-{idSuffix}`. */
  readonly idSuffix: string;
  /** Free string; mapped to `type` in the DID Document. */
  readonly serviceType: string;
  /** Absolute HTTPS URL. */
  readonly serviceEndpoint: string;
}

/**
 * Initial DID record for a sponsored registration.
 *
 * `version`, `createdLedger`, `updatedLedger` and `deactivated` are absent on
 * purpose — the contract owns them and ignores anything a caller passes.
 */
export interface SponsoredDidRecordInput {
  /**
   * Stellar `G...` account that will own the DID from version 1.
   * MUST differ from the sponsor: the contract rejects `sponsor == controller`
   * with `sponsor_is_controller`, because sponsoring yourself is plain
   * `register` plus a custody window.
   */
  readonly controller: string;
  /** 1-3 authentication keys. At least one is required. */
  readonly authentication: readonly SponsoredDidKey[];
  /** 0-3 assertion-method keys. Must not repeat an authentication key. */
  readonly assertionMethod?: readonly SponsoredDidKey[];
  /** 0-1 key-agreement key. */
  readonly keyAgreement?: readonly SponsoredDidKey[];
  /** 0-3 services. */
  readonly services?: readonly SponsoredDidService[];
  /** Optional absolute HTTPS URI to extended off-chain metadata. */
  readonly metadataUri?: string;
  /** Optional SHA-256 of the metadata, 64 lowercase hex chars. Needs `metadataUri`. */
  readonly metadataHash?: string;
}

/** One generated Ed25519 key: private material plus its Multikey encoding. */
export interface GeneratedDidKey {
  /** Raw private key, hex encoded. Never send this to the sponsor. */
  readonly privateKeyHex: string;
  /** Raw public key, hex encoded. */
  readonly publicKeyHex: string;
  /** W3C Multikey form of the public key — this is what goes on-chain. */
  readonly publicKeyMultibase: string;
}

/**
 * A conforming pair of DID keys: one for `authentication`, a DISTINCT one for
 * `assertionMethod`.
 */
export interface GeneratedDidKeys {
  readonly authentication: GeneratedDidKey;
  readonly assertionMethod: GeneratedDidKey;
}

/**
 * Build a fresh canonical `did:stellar:{network}:{didId}`.
 *
 * The id is random, so a collision with an existing record is not a practical
 * concern; if one ever occurred the contract rejects it with
 * `did_already_exists` and you simply generate another.
 */
export function generateSponsoredDid(network: "mainnet" | "testnet"): string {
  return buildDidStellar(network, generateDidId());
}

/**
 * Generate the key material for a sponsored DID, on the **subject's** side.
 *
 * Returns two distinct Ed25519 keys. They must be distinct: the registry
 * enforces that a key appears in at most one verification relationship and
 * rejects reuse on-chain with `duplicate_key`.
 *
 * Only `publicKeyMultibase` should ever leave the subject's device. Handing
 * the sponsor a private key defeats the point of the sponsored flow.
 */
export async function generateSponsoredDidKeys(): Promise<GeneratedDidKeys> {
  const authentication = await generateEd25519Key();
  const assertionMethod = await generateEd25519Key();

  // A CSPRNG returning the same key twice would mean a broken RNG, but the
  // failure mode on-chain is an opaque `duplicate_key`, so check explicitly.
  if (authentication.publicKeyHex === assertionMethod.publicKeyHex) {
    throw new Error(
      "Key generation produced identical keys; refusing to build a DID record."
    );
  }

  return { authentication, assertionMethod };
}

/**
 * Assemble a {@link SponsoredDidRecordInput} from a controller address and a
 * generated key pair set. Convenience over hand-building the record shape.
 */
export function buildSponsoredDidRecord(args: {
  /** `G...` account that will own the DID. MUST differ from the sponsor. */
  controller: string;
  keys: GeneratedDidKeys;
  services?: readonly SponsoredDidService[];
  metadataUri?: string;
  metadataHash?: string;
}): SponsoredDidRecordInput {
  return {
    controller: args.controller,
    authentication: [
      { publicKeyMultibase: args.keys.authentication.publicKeyMultibase },
    ],
    assertionMethod: [
      { publicKeyMultibase: args.keys.assertionMethod.publicKeyMultibase },
    ],
    keyAgreement: [],
    services: args.services ?? [],
    ...(args.metadataUri !== undefined ? { metadataUri: args.metadataUri } : {}),
    ...(args.metadataHash !== undefined
      ? { metadataHash: args.metadataHash }
      : {}),
  };
}

/**
 * Generate one Ed25519 keypair and its Multikey encoding.
 *
 * Uses the async `getPublicKeyAsync`: the sync `getPublicKey` throws
 * "hashes.sha512Sync not set" in @noble/ed25519 v2 unless a sync SHA-512 is
 * configured, which the SDK does not do.
 */
async function generateEd25519Key(): Promise<GeneratedDidKey> {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  return {
    privateKeyHex: bytesToHex(privateKey),
    publicKeyHex: bytesToHex(publicKey),
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
