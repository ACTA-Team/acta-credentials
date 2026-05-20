import { useActaClient } from "../providers/ActaClientContext";
import type {
  VaultGetVcParentResponse,
  VaultVerifyVcResponse,
  VaultMetadataResponse,
} from "../types/api-responses";
import { CONTRACT_LIMITS } from "../utils/contract-limits";

/**
 * Hook for reading vault data. Updated for API v1.2.0:
 *
 * - `listVcIds` now accepts `offset` / `limit` (default 0 / 50, max 200).
 * - `listAllVcIds` automatically paginates using `vcCount`.
 * - New `vcCount`, `metadata`, and `getVcParent` helpers.
 * - `verifyVc` return type widened to include `'invalid'` / `'unknown'`.
 */
export function useVaultRead() {
  const client = useActaClient();

  return {
    /**
     * List a single page of VC IDs. Defaults to the first 50 IDs.
     */
    listVcIds: async (args: {
      owner: string;
      offset?: number;
      limit?: number;
      contractId?: string;
    }): Promise<string[]> => {
      const result = await client.vaultListVcIdsDirect(args);
      return Array.isArray(result.result)
        ? result.result
        : Array.isArray(result.vc_ids)
          ? result.vc_ids
          : [];
    },

    /**
     * Fetch every VC ID in the vault. Uses {@link vcCount} to size the
     * iteration so we never paginate past the end. `pageSize` defaults to
     * {@link CONTRACT_LIMITS.MAX_LIST_LIMIT}.
     *
     * Defensive cap: refuses to fetch more than 10 000 IDs to avoid OOMing
     * the caller on a runaway vault. Raise it explicitly via `maxItems`
     * when you need the full list.
     */
    listAllVcIds: async (args: {
      owner: string;
      pageSize?: number;
      maxItems?: number;
      contractId?: string;
    }): Promise<string[]> => {
      const pageSize = Math.min(
        args.pageSize ?? CONTRACT_LIMITS.MAX_LIST_LIMIT,
        CONTRACT_LIMITS.MAX_LIST_LIMIT
      );
      const maxItems = args.maxItems ?? 10_000;

      const countResp = await client.vaultVcCount({
        owner: args.owner,
        contractId: args.contractId,
      });
      const total = Math.min(countResp.count, maxItems);

      const out: string[] = [];
      for (let offset = 0; offset < total; offset += pageSize) {
        const page = await client.vaultListVcIdsDirect({
          owner: args.owner,
          offset,
          limit: Math.min(pageSize, total - offset),
          contractId: args.contractId,
        });
        const items = Array.isArray(page.result)
          ? page.result
          : Array.isArray(page.vc_ids)
            ? page.vc_ids
            : [];
        out.push(...items);
        if (items.length === 0) break; // defensive: stop if the API short-paginates
      }
      return out;
    },

    /** O(1) active-VC count. */
    vcCount: async (args: {
      owner: string;
      contractId?: string;
    }): Promise<number> => {
      const result = await client.vaultVcCount(args);
      return result.count;
    },

    /** Fetch a credential payload. */
    getVc: async (args: {
      owner: string;
      vcId: string;
      contractId?: string;
    }): Promise<unknown | null> => {
      const result = await client.vaultGetVcDirect(args);
      return result.vc ?? result.result ?? null;
    },

    /** Parent of a linked VC (`null` if not linked). */
    getVcParent: async (args: {
      owner: string;
      vcId: string;
      contractId?: string;
    }): Promise<VaultGetVcParentResponse["parent"]> => {
      const result = await client.vaultGetVcParent(args);
      return result.parent;
    },

    /** Verify a credential status. */
    verifyVc: async (args: {
      owner: string;
      vcId: string;
      contractId?: string;
    }): Promise<VaultVerifyVcResponse> => {
      return client.vaultVerify({
        owner: args.owner,
        vcId: args.vcId,
        vaultContractId: args.contractId,
      });
    },

    /**
     * Combined vault metadata (`admin`, `did_uri`, `revoked`, `vc_count`,
     * `authorized_issuer_count`) in one round-trip.
     */
    metadata: async (args: {
      owner: string;
      contractId?: string;
    }): Promise<VaultMetadataResponse> => {
      return client.vaultMetadata(args);
    },
  };
}
