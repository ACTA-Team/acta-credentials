import { useActaClient } from "../providers/ActaClientContext";
import { isTxPrepareResponse, isTxSubmitResponse } from "../types/api-responses";
import { CONTRACT_LIMITS } from "../utils/contract-limits";

/** Function that signs an unsigned XDR with the given network passphrase. */
type Signer = (
  // eslint-disable-next-line no-unused-vars
  unsignedXdr: string,
  // eslint-disable-next-line no-unused-vars
  opts: { networkPassphrase: string }
) => Promise<string>;

/** Vault owner: G... (account) or C... (smart wallet). */
type VaultOwner = string;

/**
 * Hook for vault lifecycle: create, authorize (single + bulk), revoke
 * issuer, revoke vault.
 */
export function useVault() {
  const client = useActaClient();

  return {
    /** Create (initialize) a vault for an owner. */
    createVault: async (args: {
      owner: VaultOwner;
      ownerDid: string;
      signTransaction: Signer;
      sourcePublicKey?: string;
      contractId?: string;
    }) => {
      const cfg = await client.getConfig();
      const contractId = args.contractId || cfg.actaContractId;
      if (!contractId) throw new Error("Contract ID not configured");

      const isSmartAccountOwner =
        args.owner.startsWith("C") && args.owner.length === 56;

      const prepareResult = await client.vaultCreate({
        owner: args.owner,
        didUri: args.ownerDid,
        ...(isSmartAccountOwner
          ? {}
          : { sourcePublicKey: args.sourcePublicKey ?? args.owner }),
        contractId,
      });
      if (!isTxPrepareResponse(prepareResult)) {
        throw new Error("Failed to prepare vault creation transaction");
      }

      const signedXdr = await args.signTransaction(prepareResult.xdr, {
        networkPassphrase: prepareResult.network,
      });
      const submitResult = await client.vaultCreate({ signedXdr });
      if (!isTxSubmitResponse(submitResult)) {
        throw new Error("Failed to submit vault creation transaction");
      }
      return { txId: submitResult.tx_id };
    },

    /** Authorize a single issuer in the vault. */
    authorizeIssuer: async (args: {
      owner: VaultOwner;
      issuer: string;
      signTransaction: Signer;
      sourcePublicKey?: string;
      contractId?: string;
    }) => {
      const cfg = await client.getConfig();
      const contractId = args.contractId || cfg.actaContractId;
      if (!contractId) throw new Error("Contract ID not configured");

      const isSmartAccountOwner =
        args.owner.startsWith("C") && args.owner.length === 56;

      const prepareResult = await client.vaultAuthorizeIssuer({
        owner: args.owner,
        issuer: args.issuer,
        ...(isSmartAccountOwner
          ? {}
          : { sourcePublicKey: args.sourcePublicKey ?? args.owner }),
        contractId,
      });
      if (!isTxPrepareResponse(prepareResult)) {
        throw new Error("Failed to prepare authorize issuer transaction");
      }

      const signedXdr = await args.signTransaction(prepareResult.xdr, {
        networkPassphrase: prepareResult.network,
      });
      const submitResult = await client.vaultAuthorizeIssuer({ signedXdr });
      if (!isTxSubmitResponse(submitResult)) {
        throw new Error("Failed to submit authorize issuer transaction");
      }
      return { txId: submitResult.tx_id };
    },

    /**
     * Replace the full authorised-issuer list in one transaction. Capped at
     * `MAX_ISSUERS_LIST = 100` by the contract.
     */
    authorizeIssuers: async (args: {
      owner: VaultOwner;
      issuers: string[];
      signTransaction: Signer;
      sourcePublicKey?: string;
      contractId?: string;
    }) => {
      const cfg = await client.getConfig();
      const contractId = args.contractId || cfg.actaContractId;
      if (!contractId) throw new Error("Contract ID not configured");
      if (args.issuers.length > CONTRACT_LIMITS.MAX_ISSUERS_LIST) {
        throw new Error(
          `authorizeIssuers accepts at most ${CONTRACT_LIMITS.MAX_ISSUERS_LIST} entries per call`
        );
      }

      const sourcePublicKey = args.sourcePublicKey ?? args.owner;
      const prepareResult = await client.vaultAuthorizeIssuers({
        owner: args.owner,
        issuers: args.issuers,
        sourcePublicKey,
        contractId,
      });
      if (!isTxPrepareResponse(prepareResult)) {
        throw new Error("Failed to prepare authorize issuers (bulk) transaction");
      }

      const signedXdr = await args.signTransaction(prepareResult.xdr, {
        networkPassphrase: prepareResult.network,
      });
      const submitResult = await client.vaultAuthorizeIssuers({ signedXdr });
      if (!isTxSubmitResponse(submitResult)) {
        throw new Error("Failed to submit authorize issuers (bulk) transaction");
      }
      return { txId: submitResult.tx_id };
    },

    /** Remove an issuer from the authorised list. */
    revokeIssuer: async (args: {
      owner: VaultOwner;
      issuer: string;
      signTransaction: Signer;
      sourcePublicKey?: string;
      contractId?: string;
    }) => {
      const cfg = await client.getConfig();
      const contractId = args.contractId || cfg.actaContractId;
      if (!contractId) throw new Error("Contract ID not configured");

      const isSmartAccountOwner =
        args.owner.startsWith("C") && args.owner.length === 56;

      const prepareResult = await client.vaultRevokeIssuerViaApi({
        owner: args.owner,
        issuer: args.issuer,
        ...(isSmartAccountOwner
          ? {}
          : { sourcePublicKey: args.sourcePublicKey ?? args.owner }),
        contractId,
      });
      if (!isTxPrepareResponse(prepareResult)) {
        throw new Error("Failed to prepare revoke issuer transaction");
      }

      const signedXdr = await args.signTransaction(prepareResult.xdr, {
        networkPassphrase: prepareResult.network,
      });
      const submitResult = await client.vaultRevokeIssuerViaApi({ signedXdr });
      if (!isTxSubmitResponse(submitResult)) {
        throw new Error("Failed to submit revoke issuer transaction");
      }
      return { txId: submitResult.tx_id };
    },
  };
}
