import { useActaClient } from "../providers/ActaClientContext";
import { isTxPrepareResponse, isTxSubmitResponse } from "../types/api-responses";
import type {
  IssuerRecord,
  IssuerRegistryStatusResponse,
  TxResponse,
} from "../types/api-responses";

/** Function that signs an unsigned XDR with the given network passphrase. */
type Signer = (
  // eslint-disable-next-line no-unused-vars
  unsignedXdr: string,
  // eslint-disable-next-line no-unused-vars
  opts: { networkPassphrase: string }
) => Promise<string>;

/**
 * Hook for the global `vc-issuer-registry` allowlist (API v1.2.0+).
 *
 * - Reads (`get`, `isAllowed`, `status`) are public to any authenticated
 *   user.
 * - Mutations (`add`, `setMetadata`, `setAllowed`, `remove`) require the
 *   registry admin to sign the prepared XDR.
 *
 * Until the contract is deployed, every method rejects with
 * `contractId_invalid`. Set `ISSUER_REGISTRY_CONTRACT_ID` in the API
 * environment when the contract is live.
 */
export function useIssuerRegistry() {
  const client = useActaClient();

  const runMutation = async (
    // eslint-disable-next-line no-unused-vars
    prepare: () => Promise<TxResponse>,
    // eslint-disable-next-line no-unused-vars
    submit: (signedXdr: string) => Promise<TxResponse>,
    sign: Signer
  ) => {
    const prep = await prepare();
    if (!isTxPrepareResponse(prep)) {
      throw new Error("Failed to prepare issuer-registry transaction");
    }
    const signed = await sign(prep.xdr, { networkPassphrase: prep.network });
    const submitResp = await submit(signed);
    if (!isTxSubmitResponse(submitResp)) {
      throw new Error("Failed to submit issuer-registry transaction");
    }
    return { txId: submitResp.tx_id };
  };

  return {
    // --- Reads -------------------------------------------------------------

    /** Full record for an issuer. Rejects with `issuer_not_found` if missing. */
    get: (args: { issuer: string; contractId?: string }): Promise<IssuerRecord> => {
      return client.issuerRegistryGet(args);
    },

    /** Cheap boolean check. Unknown issuers return `false`. */
    isAllowed: async (args: {
      issuer: string;
      contractId?: string;
    }): Promise<boolean> => {
      const result = await client.issuerRegistryIsAllowed(args);
      return result.allowed;
    },

    /** Registry admin and contract version. */
    status: (args?: {
      contractId?: string;
    }): Promise<IssuerRegistryStatusResponse> => {
      return client.issuerRegistryStatus(args);
    },

    // --- Mutations (admin signs) -------------------------------------------

    add: (args: {
      issuer: string;
      name?: string;
      did?: string;
      url?: string;
      sourcePublicKey: string;
      signTransaction: Signer;
      contractId?: string;
    }) =>
      runMutation(
        () =>
          client.issuerRegistryAdd({
            issuer: args.issuer,
            name: args.name,
            did: args.did,
            url: args.url,
            sourcePublicKey: args.sourcePublicKey,
            contractId: args.contractId,
          }),
        (signedXdr) => client.issuerRegistryAdd({ signedXdr }),
        args.signTransaction
      ),

    setMetadata: (args: {
      issuer: string;
      name?: string;
      did?: string;
      url?: string;
      sourcePublicKey: string;
      signTransaction: Signer;
      contractId?: string;
    }) =>
      runMutation(
        () =>
          client.issuerRegistrySetMetadata(args.issuer, {
            name: args.name,
            did: args.did,
            url: args.url,
            sourcePublicKey: args.sourcePublicKey,
            contractId: args.contractId,
          }),
        (signedXdr) =>
          client.issuerRegistrySetMetadata(args.issuer, { signedXdr }),
        args.signTransaction
      ),

    setAllowed: (args: {
      issuer: string;
      allowed: boolean;
      sourcePublicKey: string;
      signTransaction: Signer;
      contractId?: string;
    }) =>
      runMutation(
        () =>
          client.issuerRegistrySetAllowed(args.issuer, {
            allowed: args.allowed,
            sourcePublicKey: args.sourcePublicKey,
            contractId: args.contractId,
          }),
        (signedXdr) =>
          client.issuerRegistrySetAllowed(args.issuer, { signedXdr }),
        args.signTransaction
      ),

    remove: (args: {
      issuer: string;
      sourcePublicKey: string;
      signTransaction: Signer;
      contractId?: string;
    }) =>
      runMutation(
        () =>
          client.issuerRegistryRemove(args.issuer, {
            sourcePublicKey: args.sourcePublicKey,
            contractId: args.contractId,
          }),
        (signedXdr) => client.issuerRegistryRemove(args.issuer, { signedXdr }),
        args.signTransaction
      ),
  };
}
