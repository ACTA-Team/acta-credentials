/**
 * Public surface of the issuer-identity layer.
 *
 * Most integrators never import from here directly — the SDK wires the
 * provider in automatically when `useCredential().issue()` is called
 * without an explicit `issuerDid`. The exports below are for advanced
 * integrators who want to plug a custom storage backend, pre-seed an
 * identity, or read the persisted DID for display.
 */

export { IssuerIdentityProvider } from "./provider";
export type {
  IssuerIdentityProviderOptions,
  GetOrCreateOptions,
} from "./provider";

export {
  InMemoryIssuerIdentityStorage,
  IndexedDbIssuerIdentityStorage,
  isIndexedDbAvailable,
  autoSelectStorage,
} from "./storage";

export type { IssuerIdentity, IssuerIdentityStorage, Signer } from "./types";

/**
 * Sponsored DID registration (testnet only, `did-stellar-registry` v0.3.0+).
 * An organisation pays for a user's DID without ever controlling it.
 */
export {
  generateSponsoredDid,
  generateSponsoredDidKeys,
  buildSponsoredDidRecord,
} from "./sponsored-did";
export type {
  SponsoredDidKey,
  SponsoredDidService,
  SponsoredDidRecordInput,
  GeneratedDidKey,
  GeneratedDidKeys,
} from "./sponsored-did";
