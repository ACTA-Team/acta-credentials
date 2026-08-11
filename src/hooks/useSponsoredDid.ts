import { useMemo } from "react";
import { useActaClient } from "../providers/ActaClientContext";
import { isTxPrepareResponse, isTxSubmitResponse } from "../types/api-responses";
import {
  buildSponsoredDidRecord,
  generateSponsoredDid,
  generateSponsoredDidKeys,
} from "../identity/sponsored-did";
import type {
  GeneratedDidKeys,
  SponsoredDidRecordInput,
  SponsoredDidService,
} from "../identity/sponsored-did";

/** Function that signs an unsigned XDR with the given network passphrase. */
type Signer = (
  unsignedXdr: string,
  opts: { networkPassphrase: string }
) => Promise<string>;

/**
 * Hook for sponsored `did:stellar` registration.
 *
 * An organisation pays for a user's DID without ever controlling it: only the
 * sponsor signs, and the controller owns the DID from version 1.
 *
 * **Testnet only** — needs `did-stellar-registry` v0.3.0+. Use
 * {@link useSponsoredDid.isSupported} to branch before showing the flow.
 */
export function useSponsoredDid() {
  const client = useActaClient();

  return useMemo(
    () => ({
      /**
       * Whether the connected network supports sponsored registration.
       * Use this to gate the UI instead of hardcoding a network check.
       */
      isSupported: () => client.supportsSponsoredDidRegistration(),

      /**
       * Generate the subject's key material. Run this on the subject's side —
       * only the public multibase values should reach the sponsor.
       */
      generateKeys: (): Promise<GeneratedDidKeys> => generateSponsoredDidKeys(),

      /** Build a fresh canonical `did:stellar` for the connected network. */
      generateDid: (): string => generateSponsoredDid(client.getNetwork()),

      /**
       * Register a DID paid for by `sponsor` and controlled by `controller`.
       * Prepares, asks the sponsor's wallet to sign, and submits.
       *
       * Pass `record` to supply a pre-built record, or `controller` + `keys`
       * to have one assembled. Supply `did` to reuse an id you already
       * generated; otherwise a fresh one is created and returned.
       *
       * SECURITY: `controller` is never proved on-chain. `update`,
       * `transfer_controller` and `deactivate` all require its signature, so a
       * wrong address yields a permanently immutable record with no remedy but
       * abandoning the DID. Validate it before calling.
       *
       * @returns The registered DID and the transaction id.
       */
      registerSponsored: async (args: {
        /** `G...` account that pays and signs. MUST differ from the controller. */
        sponsor: string;

        /** Signs the prepared XDR with the sponsor's wallet. */
        signTransaction: Signer;

        /** Pre-built record. Mutually exclusive with `controller` + `keys`. */
        record?: SponsoredDidRecordInput;

        /** `G...` account that will own the DID. Used with `keys`. */
        controller?: string;

        /** Subject's key material. Used with `controller`. */
        keys?: GeneratedDidKeys;

        /** Reuse an already-generated DID. Defaults to a fresh one. */
        did?: string;

        /** Optional services to publish in the DID Document. */
        services?: readonly SponsoredDidService[];

        /** Transaction source. Defaults to `sponsor`. */
        sourcePublicKey?: string;
      }): Promise<{ did: string; txId: string }> => {
        const record =
          args.record ??
          (args.controller && args.keys
            ? buildSponsoredDidRecord({
                controller: args.controller,
                keys: args.keys,
                ...(args.services ? { services: args.services } : {}),
              })
            : undefined);

        if (!record) {
          throw new Error(
            "registerSponsored requires either `record`, or `controller` and `keys`."
          );
        }

        // Caught here so the sponsor never signs a transaction the contract
        // will reject with `sponsor_is_controller`.
        if (record.controller === args.sponsor) {
          throw new Error(
            "sponsor must differ from record.controller. Sponsoring yourself is plain registration."
          );
        }

        const did = args.did ?? generateSponsoredDid(client.getNetwork());

        const prepareResult = await client.registerSponsoredDid({
          sponsor: args.sponsor,
          did,
          record,
          ...(args.sourcePublicKey
            ? { sourcePublicKey: args.sourcePublicKey }
            : {}),
        });

        if (!isTxPrepareResponse(prepareResult)) {
          throw new Error(
            "Failed to prepare sponsored DID registration transaction"
          );
        }

        const signedXdr = await args.signTransaction(prepareResult.xdr, {
          networkPassphrase: prepareResult.network,
        });

        const submitResult = await client.registerSponsoredDid({ signedXdr });

        if (!isTxSubmitResponse(submitResult)) {
          throw new Error(
            "Failed to submit sponsored DID registration transaction"
          );
        }

        return { did, txId: submitResult.tx_id };
      },
    }),
    [client]
  );
}
