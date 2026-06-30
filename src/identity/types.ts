/**
 * Types for the issuer identity layer.
 *
 * The SDK can create, persist, and reuse a `did:stellar` identity for an
 * issuer transparently — the integrator never has to think about Ed25519
 * keys or Multikey encoding. This module defines the contracts that the
 * runtime uses to do that.
 */

/**
 * A fully materialized issuer identity ready to sign Verifiable
 * Credentials. The assertion private key is the most sensitive piece of
 * data here — it MUST stay client-side at all times.
 */
export interface IssuerIdentity {
  /** Canonical DID string (e.g. `did:stellar:testnet:abc...`). */
  readonly did: string;

  /** Stellar account that controls the DID on-chain (`G...`). */
  readonly controller: string;

  /** Multibase-encoded Ed25519 public key registered in `assertionMethod`. */
  readonly assertionPublicKeyMultibase: string;

  /**
   * Raw Ed25519 32-byte private key bytes used to sign credentials.
   * Encoded as a lowercase hex string for transport, so the storage
   * layer can persist it without choosing an encoding.
   */
  readonly assertionPrivateKeyHex: string;

  /** Hex-encoded Ed25519 32-byte public key bytes for signing. */
  readonly assertionPublicKeyHex: string;
}

/**
 * Pluggable persistence layer for issuer identities. The default
 * implementations cover browser (IndexedDB) and Node (in-memory).
 * Integrators with custom storage (KMS, encrypted file, hardware wallet)
 * can provide their own.
 */
export interface IssuerIdentityStorage {
  /**
   * Return the identity for the given `controller` if one exists, or
   * `null` otherwise. Implementations MUST scope by network so the same
   * controller can have separate testnet/mainnet identities.
   */
  get(controller: string, network: "mainnet" | "testnet"): Promise<IssuerIdentity | null>;

  /** Persist a new or updated identity. */
  set(identity: IssuerIdentity, network: "mainnet" | "testnet"): Promise<void>;
}

/**
 * Function that signs an unsigned Stellar XDR with the given network
 * passphrase. Provided by the integrator — wallets (Freighter, Albedo,
 * hardware) plug in unchanged.
 */
export type Signer = (
  unsignedXdr: string,
  opts: { networkPassphrase: string }
) => Promise<string>;
