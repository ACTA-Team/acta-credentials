import { useActaClient } from "../providers/ActaClientContext";
import { isTxPrepareResponse, isTxSubmitResponse } from "../types/api-responses";
import { normalizeDid, ensureContextInVcData } from "../utils/credential-helpers";

/** Function that signs an unsigned XDR with the given network passphrase. */
type Signer = (
  unsignedXdr: string,
  opts: { networkPassphrase: string }
) => Promise<string>;

/** Vault owner: can be a Stellar account (G...) or a smart contract wallet (C...). */
type VaultOwner = string;

/**
 * Hook for credential operations: issue and revoke.
 * @returns Methods to manage credentials via the API.
 */
export function useCredential() {
  const client = useActaClient();

  return {
    /**
     * Issue a credential (stores in vault and marks as valid).
     * @returns Transaction ID of the submitted transaction.
     */
    issue: async (args: {
      /** Wallet address of the vault owner. Can be G... (account) or C... (smart wallet). */
      owner: VaultOwner;

      /** Credential ID */
      vcId: string;

      /** Credential data (object or JSON string). @context is added automatically */
      vcData: string | Record<string, unknown>;

      /** Wallet address of the issuer */
      issuer: string;

      /**
       * Issuer DID. **Optional.** When omitted, the SDK transparently
       * gets-or-creates a `did:stellar` for `issuer` via
       * {@link ActaClient.getOrCreateIssuerIdentity}, using
       * `signTransaction` to authorize the on-chain registration the
       * first time. Subsequent calls reuse the persisted DID.
       */
      issuerDid?: string;

      /** Function to sign transactions */
      signTransaction: Signer;

      /** Optional explicit source account (G...) that will sign the transaction.
       *  For G... owners, defaults to issuer when omitted.
       *  For C... owners, the backend uses the relayer regardless. */
      sourcePublicKey?: string;

      /** Contract ID (optional, defaults to network contract) */
      contractId?: string;

      /** Optional salt used to derive the owner's single-tenant vault. */
      userSalt?: string;
    }) => {
      const cfg = await client.getConfig();
      const contractId = args.contractId || cfg.actaContractId;

      if (!contractId) throw new Error("Contract ID not configured");

      const network = client.getNetwork();

      const resolvedDid =
        args.issuerDid ??
        (
          await client.getOrCreateIssuerIdentity({
            controller: args.issuer,
            signTransaction: args.signTransaction,
          })
        ).did;

      const issuerDid = normalizeDid(resolvedDid, network);

      // Ensure @context is present in vcData
      const vcDataWithContext = ensureContextInVcData(args.vcData);

      const isSmartAccountOwner =
        args.owner.startsWith("C") && args.owner.length === 56;

      // Prepare the transaction via API
      const prepareResult = await client.vcIssue({
        owner: args.owner,
        vcId: args.vcId,
        vcData: vcDataWithContext,
        issuer: args.issuer,
        issuerDid: issuerDid,
        ...(isSmartAccountOwner
          ? {}
          : {
              sourcePublicKey: args.sourcePublicKey ?? args.issuer,
            }),
        contractId: contractId,
        userSalt: args.userSalt,
      });

      if (!isTxPrepareResponse(prepareResult)) {
        throw new Error("Failed to prepare issue credential transaction");
      }

      // Sign the transaction
      const signedXdr = await args.signTransaction(prepareResult.xdr, {
        networkPassphrase: prepareResult.network,
      });

      // Submit the signed transaction via API
      const submitResult = await client.vcIssue({ signedXdr });

      if (!isTxSubmitResponse(submitResult)) {
        throw new Error("Failed to submit issue credential transaction");
      }

      return { txId: submitResult.tx_id };
    },

    /**
     * Revoke a credential.
     * @returns Transaction ID of the submitted transaction.
     */
    revoke: async (args: {
      /** Wallet address of the vault owner. Can be G... (account) or C... (smart wallet). */
      owner: VaultOwner;

      /** Credential ID to revoke */
      vcId: string;

      /** Function to sign transactions */
      signTransaction: Signer;

      /** Revocation date (ISO timestamp, optional, defaults to now) */
      date?: string;

      /** Optional explicit source account (G...) that will sign the transaction.
       *  For G... owners, defaults to owner when omitted.
       *  For C... owners, the backend uses the relayer regardless. */
      sourcePublicKey?: string;

      /** Contract ID (optional, defaults to network contract) */
      contractId?: string;

      /** Optional salt used to derive the owner's single-tenant vault. */
      userSalt?: string;
    }) => {
      const cfg = await client.getConfig();
      const contractId = args.contractId || cfg.actaContractId;

      if (!contractId) throw new Error("Contract ID not configured");

      const isSmartAccountOwner =
        args.owner.startsWith("C") && args.owner.length === 56;

      // Prepare the transaction via API
      const prepareResult = await client.revokeCredentialViaApi({
        owner: args.owner,
        vcId: args.vcId,
        date: args.date || new Date().toISOString(),
        ...(isSmartAccountOwner
          ? {}
          : {
              sourcePublicKey: args.sourcePublicKey ?? args.owner,
            }),
        contractId: contractId,
        userSalt: args.userSalt,
      });

      if (!isTxPrepareResponse(prepareResult)) {
        throw new Error("Failed to prepare revoke credential transaction");
      }

      // Sign the transaction
      const signedXdr = await args.signTransaction(prepareResult.xdr, {
        networkPassphrase: prepareResult.network,
      });

      // Submit the signed transaction via API
      const submitResult = await client.revokeCredentialViaApi({ signedXdr });

      if (!isTxSubmitResponse(submitResult)) {
        throw new Error("Failed to submit revoke credential transaction");
      }

      return { txId: submitResult.tx_id };
    },
  };
}
