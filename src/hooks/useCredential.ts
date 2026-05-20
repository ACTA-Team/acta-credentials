import { useActaClient } from "../providers/ActaClientContext";
import { isTxPrepareResponse, isTxSubmitResponse } from "../types/api-responses";
import { normalizeDid, ensureContextInVcData } from "../utils/credential-helpers";

/** Function that signs an unsigned XDR with the given network passphrase. */
type Signer = (
  // eslint-disable-next-line no-unused-vars
  unsignedXdr: string,
  // eslint-disable-next-line no-unused-vars
  opts: { networkPassphrase: string }
) => Promise<string>;

/** Vault owner: can be a Stellar account (G...) or a smart contract wallet (C...). */
type VaultOwner = string;

/**
 * Hook for credential operations: issue, issueLinked, batchIssue, revoke.
 */
export function useCredential() {
  const client = useActaClient();

  return {
    /**
     * Issue a single credential (stores in vault and marks as valid).
     */
    issue: async (args: {
      owner: VaultOwner;
      vcId: string;
      vcData: string | Record<string, unknown>;
      issuer: string;
      issuerDid?: string;
      signTransaction: Signer;
      sourcePublicKey?: string;
      contractId?: string;
    }) => {
      const cfg = await client.getConfig();
      const contractId = args.contractId || cfg.actaContractId;
      if (!contractId) throw new Error("Contract ID not configured");

      const network = client.getNetwork();
      const issuerDid = args.issuerDid
        ? normalizeDid(args.issuerDid, network)
        : undefined;
      const vcDataWithContext = ensureContextInVcData(args.vcData);

      const isSmartAccountOwner =
        args.owner.startsWith("C") && args.owner.length === 56;

      const prepareResult = await client.vcIssue({
        owner: args.owner,
        vcId: args.vcId,
        vcData: vcDataWithContext,
        issuer: args.issuer,
        issuerDid,
        ...(isSmartAccountOwner
          ? {}
          : { sourcePublicKey: args.sourcePublicKey ?? args.issuer }),
        contractId,
      });

      if (!isTxPrepareResponse(prepareResult)) {
        throw new Error("Failed to prepare issue credential transaction");
      }

      const signedXdr = await args.signTransaction(prepareResult.xdr, {
        networkPassphrase: prepareResult.network,
      });

      const submitResult = await client.vcIssue({ signedXdr });
      if (!isTxSubmitResponse(submitResult)) {
        throw new Error("Failed to submit issue credential transaction");
      }
      return { txId: submitResult.tx_id };
    },

    /**
     * Issue a credential linked to a parent VC in another vault.
     */
    issueLinked: async (args: {
      owner: VaultOwner;
      vcId: string;
      vcData: string | Record<string, unknown>;
      issuer: string;
      issuerDid?: string;
      signTransaction: Signer;
      sourcePublicKey?: string;
      contractId?: string;
      parentOwner: string;
      parentVcId: string;
    }) => {
      const cfg = await client.getConfig();
      const contractId = args.contractId || cfg.actaContractId;
      if (!contractId) throw new Error("Contract ID not configured");

      const network = client.getNetwork();
      const issuerDid = args.issuerDid
        ? normalizeDid(args.issuerDid, network)
        : undefined;
      const vcDataWithContext = ensureContextInVcData(args.vcData);

      const isSmartAccountOwner =
        args.owner.startsWith("C") && args.owner.length === 56;

      const prepareResult = await client.vcIssueLinked({
        owner: args.owner,
        vcId: args.vcId,
        vcData: vcDataWithContext,
        issuer: args.issuer,
        issuerDid,
        ...(isSmartAccountOwner
          ? {}
          : { sourcePublicKey: args.sourcePublicKey ?? args.issuer }),
        contractId,
        parentOwner: args.parentOwner,
        parentVcId: args.parentVcId,
      });

      if (!isTxPrepareResponse(prepareResult)) {
        throw new Error("Failed to prepare issue linked credential transaction");
      }

      const signedXdr = await args.signTransaction(prepareResult.xdr, {
        networkPassphrase: prepareResult.network,
      });

      const submitResult = await client.vcIssueLinked({ signedXdr });
      if (!isTxSubmitResponse(submitResult)) {
        throw new Error("Failed to submit issue linked credential transaction");
      }
      return { txId: submitResult.tx_id };
    },

    /**
     * Issue up to 5 VCs in a single transaction. Maps to `POST
     * /contracts/vc/batch-issue` (added in API v1.2.0).
     */
    batchIssue: async (args: {
      owner: VaultOwner;
      issuer: string;
      issuerDid?: string;
      vcs: Array<{ vcId: string; vcData: string | Record<string, unknown> }>;
      signTransaction: Signer;
      sourcePublicKey?: string;
      contractId?: string;
    }) => {
      const cfg = await client.getConfig();
      const contractId = args.contractId || cfg.actaContractId;
      if (!contractId) throw new Error("Contract ID not configured");
      if (!Array.isArray(args.vcs) || args.vcs.length === 0) {
        throw new Error("vcs must contain at least one entry");
      }
      if (args.vcs.length > 5) {
        throw new Error("batchIssue accepts at most 5 vcs per call");
      }

      const network = client.getNetwork();
      const issuerDid = args.issuerDid
        ? normalizeDid(args.issuerDid, network)
        : undefined;

      const isSmartAccountOwner =
        args.owner.startsWith("C") && args.owner.length === 56;

      const vcs = args.vcs.map((entry) => ({
        vcId: entry.vcId,
        vcData: ensureContextInVcData(entry.vcData),
      }));

      const prepareResult = await client.vcBatchIssue({
        owner: args.owner,
        issuer: args.issuer,
        issuerDid,
        vcs,
        ...(isSmartAccountOwner
          ? {}
          : { sourcePublicKey: args.sourcePublicKey ?? args.issuer }),
        contractId,
      });

      if (!isTxPrepareResponse(prepareResult)) {
        throw new Error("Failed to prepare batch issue transaction");
      }

      const signedXdr = await args.signTransaction(prepareResult.xdr, {
        networkPassphrase: prepareResult.network,
      });

      const submitResult = await client.vcBatchIssue({ signedXdr });
      if (!isTxSubmitResponse(submitResult)) {
        throw new Error("Failed to submit batch issue transaction");
      }
      return { txId: submitResult.tx_id };
    },

    /**
     * Revoke a credential. The owner MUST sign — the contract calls
     * `owner.require_auth()` and a relayer signature is not accepted.
     */
    revoke: async (args: {
      owner: VaultOwner;
      vcId: string;
      signTransaction: Signer;
      date?: string;
      sourcePublicKey?: string;
      contractId?: string;
    }) => {
      const cfg = await client.getConfig();
      const contractId = args.contractId || cfg.actaContractId;
      if (!contractId) throw new Error("Contract ID not configured");
      if (args.owner.startsWith("C")) {
        // The contract authorises the owner via require_auth() — for
        // smart-account owners we'd need an account-contract signing flow
        // which is not modelled here.
        throw new Error(
          "revoke() only supports G... vault owners (the contract calls owner.require_auth())"
        );
      }

      const prepareResult = await client.revokeCredentialViaApi({
        owner: args.owner,
        vcId: args.vcId,
        date: args.date || new Date().toISOString(),
        sourcePublicKey: args.sourcePublicKey ?? args.owner,
        contractId,
      });

      if (!isTxPrepareResponse(prepareResult)) {
        throw new Error("Failed to prepare revoke credential transaction");
      }

      const signedXdr = await args.signTransaction(prepareResult.xdr, {
        networkPassphrase: prepareResult.network,
      });

      const submitResult = await client.revokeCredentialViaApi({ signedXdr });
      if (!isTxSubmitResponse(submitResult)) {
        throw new Error("Failed to submit revoke credential transaction");
      }
      return { txId: submitResult.tx_id };
    },
  };
}
