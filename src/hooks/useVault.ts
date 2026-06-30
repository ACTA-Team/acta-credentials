import { useActaClient } from "../providers/ActaClientContext";
import { isTxPrepareResponse, isTxSubmitResponse } from "../types/api-responses";

/** Function that signs an unsigned XDR with the given network passphrase. */
type Signer = (
  unsignedXdr: string,
  opts: { networkPassphrase: string }
) => Promise<string>;

/** Vault owner: can be a Stellar account (G...) or a smart contract wallet (C...). */
type VaultOwner = string;

/**
 * Hook for vault operations: create, authorize issuer, revoke issuer.
 * @returns Methods to manage vault operations via the API.
 */
export function useVault() {
  const client = useActaClient();

  return {
    /**
     * Create (initialize) a vault for an owner.
     * @returns Transaction ID of the submitted transaction.
     */
    createVault: async (args: {
      /** Wallet address of the vault owner. Can be G... (account) or C... (smart wallet). */
      owner: VaultOwner;

      /** DID of the vault owner */
      ownerDid: string;

      /** Function to sign transactions */
      signTransaction: Signer;

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
      const prepareResult = await client.vaultCreate({
        owner: args.owner,
        didUri: args.ownerDid,
        ...(isSmartAccountOwner
          ? {}
          : {
              sourcePublicKey: args.sourcePublicKey ?? args.owner,
            }),
        contractId: contractId,
        userSalt: args.userSalt,
      });

      if (!isTxPrepareResponse(prepareResult)) {
        throw new Error("Failed to prepare vault creation transaction");
      }

      // Sign the transaction
      const signedXdr = await args.signTransaction(prepareResult.xdr, {
        networkPassphrase: prepareResult.network,
      });

      // Submit the signed transaction via API
      const submitResult = await client.vaultCreate({ signedXdr });

      if (!isTxSubmitResponse(submitResult)) {
        throw new Error("Failed to submit vault creation transaction");
      }

      return { txId: submitResult.tx_id };
    },

    /**
     * Authorize an issuer in a vault.
     * @returns Transaction ID of the submitted transaction.
     */
    authorizeIssuer: async (args: {
      /** Wallet address of the vault owner. Can be G... (account) or C... (smart wallet). */
      owner: VaultOwner;

      /** Wallet address of the issuer to authorize */
      issuer: string;

      /** Function to sign transactions */
      signTransaction: Signer;

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
      const prepareResult = await client.vaultAuthorizeIssuer({
        owner: args.owner,
        issuer: args.issuer,
        ...(isSmartAccountOwner
          ? {}
          : {
              sourcePublicKey: args.sourcePublicKey ?? args.owner,
            }),
        contractId: contractId,
        userSalt: args.userSalt,
      });

      if (!isTxPrepareResponse(prepareResult)) {
        throw new Error("Failed to prepare authorize issuer transaction");
      }

      // Sign the transaction
      const signedXdr = await args.signTransaction(prepareResult.xdr, {
        networkPassphrase: prepareResult.network,
      });

      // Submit the signed transaction via API
      const submitResult = await client.vaultAuthorizeIssuer({ signedXdr });

      if (!isTxSubmitResponse(submitResult)) {
        throw new Error("Failed to submit authorize issuer transaction");
      }

      return { txId: submitResult.tx_id };
    },

    /**
     * Revoke (remove) an authorized issuer from a vault.
     * @returns Transaction ID of the submitted transaction.
     */
    revokeIssuer: async (args: {
      /** Wallet address of the vault owner. Can be G... (account) or C... (smart wallet). */
      owner: VaultOwner;

      /** Wallet address of the issuer to revoke */
      issuer: string;

      /** Function to sign transactions */
      signTransaction: Signer;

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
      const prepareResult = await client.vaultRevokeIssuerViaApi({
        owner: args.owner,
        issuer: args.issuer,
        ...(isSmartAccountOwner
          ? {}
          : {
              sourcePublicKey: args.sourcePublicKey ?? args.owner,
            }),
        contractId: contractId,
        userSalt: args.userSalt,
      });

      if (!isTxPrepareResponse(prepareResult)) {
        throw new Error("Failed to prepare revoke issuer transaction");
      }

      // Sign the transaction
      const signedXdr = await args.signTransaction(prepareResult.xdr, {
        networkPassphrase: prepareResult.network,
      });

      // Submit the signed transaction via API
      const submitResult = await client.vaultRevokeIssuerViaApi({ signedXdr });

      if (!isTxSubmitResponse(submitResult)) {
        throw new Error("Failed to submit revoke issuer transaction");
      }

      return { txId: submitResult.tx_id };
    },

    /**
     * Deny an issuer in a vault (`POST /contracts/vault/deny-issuer`).
     * @returns Transaction ID of the submitted transaction.
     */
    denyIssuer: async (args: {
      /** Wallet address of the vault owner. Can be G... (account) or C... (smart wallet). */
      owner: VaultOwner;

      /** Wallet address of the issuer to deny */
      issuer: string;

      /** Function to sign transactions */
      signTransaction: Signer;

      /** Optional explicit source account (G...) that will sign the transaction.
       *  For G... owners, defaults to owner when omitted.
       *  For C... owners, the backend uses the relayer regardless. */
      sourcePublicKey?: string;

      /** Optional salt used to derive the owner's single-tenant vault. */
      userSalt?: string;
    }) => {
      const isSmartAccountOwner =
        args.owner.startsWith("C") && args.owner.length === 56;

      // Prepare the transaction via API
      const prepareResult = await client.vaultDenyIssuer({
        owner: args.owner,
        issuer: args.issuer,
        ...(isSmartAccountOwner
          ? {}
          : {
              sourcePublicKey: args.sourcePublicKey ?? args.owner,
            }),
        userSalt: args.userSalt,
      });

      if (!isTxPrepareResponse(prepareResult)) {
        throw new Error("Failed to prepare deny issuer transaction");
      }

      // Sign the transaction
      const signedXdr = await args.signTransaction(prepareResult.xdr, {
        networkPassphrase: prepareResult.network,
      });

      // Submit the signed transaction via API
      const submitResult = await client.vaultDenyIssuer({ signedXdr });

      if (!isTxSubmitResponse(submitResult)) {
        throw new Error("Failed to submit deny issuer transaction");
      }

      return { txId: submitResult.tx_id };
    },

    /**
     * Allow an issuer in a vault (`POST /contracts/vault/allow-issuer`).
     * @returns Transaction ID of the submitted transaction.
     */
    allowIssuer: async (args: {
      /** Wallet address of the vault owner. Can be G... (account) or C... (smart wallet). */
      owner: VaultOwner;

      /** Wallet address of the issuer to allow */
      issuer: string;

      /** Function to sign transactions */
      signTransaction: Signer;

      /** Optional explicit source account (G...) that will sign the transaction.
       *  For G... owners, defaults to owner when omitted.
       *  For C... owners, the backend uses the relayer regardless. */
      sourcePublicKey?: string;

      /** Optional salt used to derive the owner's single-tenant vault. */
      userSalt?: string;
    }) => {
      const isSmartAccountOwner =
        args.owner.startsWith("C") && args.owner.length === 56;

      // Prepare the transaction via API
      const prepareResult = await client.vaultAllowIssuer({
        owner: args.owner,
        issuer: args.issuer,
        ...(isSmartAccountOwner
          ? {}
          : {
              sourcePublicKey: args.sourcePublicKey ?? args.owner,
            }),
        userSalt: args.userSalt,
      });

      if (!isTxPrepareResponse(prepareResult)) {
        throw new Error("Failed to prepare allow issuer transaction");
      }

      // Sign the transaction
      const signedXdr = await args.signTransaction(prepareResult.xdr, {
        networkPassphrase: prepareResult.network,
      });

      // Submit the signed transaction via API
      const submitResult = await client.vaultAllowIssuer({ signedXdr });

      if (!isTxSubmitResponse(submitResult)) {
        throw new Error("Failed to submit allow issuer transaction");
      }

      return { txId: submitResult.tx_id };
    },
  };
}
