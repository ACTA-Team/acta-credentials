import { useActaClient } from "../providers/ActaClientContext";
import type { VaultGetVcParentResponse, VaultVerifyVcResponse } from "../types/api-responses";

/**
 * Hook for reading vault data: list VC IDs, get VC, verify VC.
 * @returns Methods to read vault data via the API.
 */
export function useVaultRead() {
  const client = useActaClient();

  return {
    /**
     * List VC IDs owned by an owner.
     * @returns Array of VC IDs.
     */
    listVcIds: async (args: {
      /** Wallet address of the vault owner */
      owner: string;

      /** Contract ID (optional, defaults to network contract) */
      contractId?: string;
    }): Promise<string[]> => {
      const result = await client.vaultListVcIdsDirect({
        owner: args.owner,
        contractId: args.contractId,
      });
      return Array.isArray(result.vc_ids)
        ? result.vc_ids
        : Array.isArray(result.result)
          ? result.result
          : [];
    },

    /**
     * Get a credential from the vault.
     * @returns VC data or null if not found.
     */
    getVc: async (args: {
      /** Wallet address of the vault owner */
      owner: string;

      /** Credential ID */
      vcId: string;

      /** Contract ID (optional, defaults to network contract) */
      contractId?: string;
    }): Promise<unknown | null> => {
      const result = await client.vaultGetVcDirect({
        owner: args.owner,
        vcId: args.vcId,
        contractId: args.contractId,
      });
      return result.vc ?? result.result ?? null;
    },

    /**
     * Get the parent VC info for a linked credential.
     * @returns Parent VC info or null if no parent link.
     */
    getVcParent: async (args: {
      /** Wallet address of the vault owner */
      owner: string;

      /** Credential ID */
      vcId: string;

      /** Contract ID (optional, defaults to network contract) */
      contractId?: string;
    }): Promise<VaultGetVcParentResponse["parent"]> => {
      const result = await client.vaultGetVcParent({
        owner: args.owner,
        vcId: args.vcId,
        contractId: args.contractId,
      });
      return result.parent;
    },

    /**
     * Verify a credential status in the vault.
     * @returns Verification result with status and optional since date.
     */
    verifyVc: async (args: {
      /** Wallet address of the vault owner */
      owner: string;

      /** Credential ID */
      vcId: string;

      /** Contract ID (optional, defaults to network contract) */
      contractId?: string;
    }): Promise<VaultVerifyVcResponse> => {
      return client.vaultVerify({
        owner: args.owner,
        vcId: args.vcId,
        vaultContractId: args.contractId,
      });
    },
  };
}
