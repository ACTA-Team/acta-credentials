import { useActaClient } from "../providers/ActaClientContext";
import { CONTRACT_LIMITS } from "../utils/contract-limits";

/**
 * Hook for reading the authorised / denied issuer lists of a vault.
 *
 * `list` and `listDenied` are paginated (default `limit = 50`, capped at
 * `MAX_LIST_LIMIT = 200`). `listAll` and `listAllDenied` auto-paginate
 * using the O(1) count endpoints; they default-cap at 10 000 entries to
 * protect callers from runaway loops.
 */
export function useVaultIssuers() {
  const client = useActaClient();

  return {
    /** O(1) count of authorised issuers. */
    count: async (args: {
      owner: string;
      contractId?: string;
    }): Promise<number> => {
      const result = await client.vaultAuthorizedIssuerCount(args);
      return result.count;
    },

    /** O(1) count of denied (revoked) issuers. */
    countDenied: async (args: {
      owner: string;
      contractId?: string;
    }): Promise<number> => {
      const result = await client.vaultDeniedIssuerCount(args);
      return result.count;
    },

    /** Single page of authorised issuers. */
    list: async (args: {
      owner: string;
      offset?: number;
      limit?: number;
      contractId?: string;
    }): Promise<string[]> => {
      const result = await client.vaultListAuthorizedIssuers(args);
      return result.issuers;
    },

    /** Single page of denied issuers. */
    listDenied: async (args: {
      owner: string;
      offset?: number;
      limit?: number;
      contractId?: string;
    }): Promise<string[]> => {
      const result = await client.vaultListDeniedIssuers(args);
      return result.issuers;
    },

    /** Full authorised-issuer list, auto-paginated. */
    listAll: async (args: {
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
      const total = Math.min(
        (await client.vaultAuthorizedIssuerCount(args)).count,
        maxItems
      );
      const out: string[] = [];
      for (let offset = 0; offset < total; offset += pageSize) {
        const page = await client.vaultListAuthorizedIssuers({
          owner: args.owner,
          offset,
          limit: Math.min(pageSize, total - offset),
          contractId: args.contractId,
        });
        out.push(...page.issuers);
        if (page.issuers.length === 0) break;
      }
      return out;
    },

    /** Full denied-issuer list, auto-paginated. */
    listAllDenied: async (args: {
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
      const total = Math.min(
        (await client.vaultDeniedIssuerCount(args)).count,
        maxItems
      );
      const out: string[] = [];
      for (let offset = 0; offset < total; offset += pageSize) {
        const page = await client.vaultListDeniedIssuers({
          owner: args.owner,
          offset,
          limit: Math.min(pageSize, total - offset),
          contractId: args.contractId,
        });
        out.push(...page.issuers);
        if (page.issuers.length === 0) break;
      }
      return out;
    },
  };
}
