import axios, { AxiosInstance } from "axios";
import { baseURL } from "./types/types";
import type {
  ConfigResponse,
  HealthResponse,
  TxPrepareResponse,
  VaultCreateResponse,
  VaultAuthorizeIssuerResponse,
  VaultAuthorizeIssuersResponse,
  VaultRevokeIssuerResponse,
  VaultRevokeVaultResponse,
  VaultSetNewOwnerResponse,
  VaultPushResponse,
  VcIssueResponse,
  VcIssueLinkedResponse,
  VcBatchIssueResponse,
  VcRevokeResponse,
  VaultListVcIdsResponse,
  VaultGetVcResponse,
  VaultGetVcParentResponse,
  VaultVerifyVcResponse,
  VaultVcCountResponse,
  VaultIssuerListResponse,
  VaultIssuerCountResponse,
  VaultMetadataResponse,
  ContractVersionResponse,
  SponsoredVaultCreateResponse,
  SponsoredVaultSetOpenToAllResponse,
  SponsoredVaultAddSponsorResponse,
  SponsoredVaultRemoveSponsorResponse,
  SponsoredVaultOpenToAllReadResponse,
  IssuerRegistryAddResponse,
  IssuerRegistrySetMetadataResponse,
  IssuerRegistrySetAllowedResponse,
  IssuerRegistryRemoveResponse,
  IssuerRecord,
  IssuerRegistryIsAllowedResponse,
  IssuerRegistryStatusResponse,
} from "./types/api-responses";
import { actaErrorFromAxios } from "./utils/acta-error";

/**
 * ACTA SDK HTTP client.
 *
 * Wraps the ACTA API endpoints to issue, store, read and verify
 * credentials, manage vaults, and (since v1.1.2) work with the
 * `vc-issuer-registry`. The active network is inferred from the `baseURL`.
 *
 * All methods reject with an {@link ActaError} on non-2xx responses so
 * callers can branch on `err.code` instead of substring-matching messages.
 */
export class ActaClient {
  private axios: AxiosInstance;
  private network: "mainnet" | "testnet";
  private configCache: ConfigResponse | null = null;

  /**
   * Initialize a new client instance.
   * @param baseURL - Base API URL for ACTA services (mainnet or testnet).
   * @param apiKey - API key for authentication. If not provided, read from
   *   `ACTA_API_KEY_MAINNET` / `ACTA_API_KEY_TESTNET` (network-specific)
   *   or `ACTA_API_KEY` (fallback).
   * @throws Error if no API key is found.
   */
  constructor(baseURL: baseURL, apiKey?: string) {
    this.axios = axios.create({ baseURL });
    this.network = baseURL.includes("mainnet") ? "mainnet" : "testnet";

    const env = typeof process !== "undefined" ? process.env : {};
    const networkSpecificKey =
      this.network === "mainnet"
        ? env.ACTA_API_KEY_MAINNET
        : env.ACTA_API_KEY_TESTNET;
    const finalApiKey = apiKey || networkSpecificKey || env.ACTA_API_KEY;

    if (!finalApiKey || finalApiKey.trim() === "") {
      const networkVar =
        this.network === "mainnet"
          ? "ACTA_API_KEY_MAINNET"
          : "ACTA_API_KEY_TESTNET";
      throw new Error(
        `API key is required for ${this.network}.\n` +
          `Provide it as a parameter or set it in your .env file:\n` +
          `- ${networkVar}=your-${this.network}-api-key (recommended)\n` +
          `- Or ACTA_API_KEY=your-api-key (fallback for both networks)\n\n` +
          `Get your API key from https://dapp.acta.build or create one via:\n` +
          `- POST /testnet/public/api-keys (for testnet)\n` +
          `- POST /mainnet/public/api-keys (for mainnet)`
      );
    }

    // Inject X-ACTA-Key on every request.
    this.axios.interceptors.request.use((config) => {
      config.headers = config.headers || {};
      config.headers["X-ACTA-Key"] = finalApiKey.trim();
      return config;
    });

    // Convert any non-2xx into a typed ActaError so consumers can branch
    // on `err.code` instead of parsing `err.response?.data?.error`.
    this.axios.interceptors.response.use(
      (response) => response,
      (error) => {
        return Promise.reject(actaErrorFromAxios(error));
      }
    );
  }

  // -------------------------------------------------------------------------
  // Bootstrap
  // -------------------------------------------------------------------------

  /** Network type (mainnet or testnet). */
  getNetwork(): "mainnet" | "testnet" {
    return this.network;
  }

  /** Service health. */
  getHealth(): Promise<HealthResponse> {
    return this.axios.get<HealthResponse>("/health").then((r) => r.data);
  }

  /**
   * Read `/config`. Cached for the lifetime of the client to avoid an
   * RTT before every signing flow.
   */
  async getConfig(): Promise<ConfigResponse> {
    if (this.configCache) return this.configCache;
    const response = await this.axios.get<ConfigResponse>("/config");
    this.configCache = response.data;
    return this.configCache;
  }

  // -------------------------------------------------------------------------
  // Convenience: prepare-only helper for issuing
  // -------------------------------------------------------------------------

  /**
   * Prepare an unsigned XDR to issue a credential. Thin wrapper over
   * {@link ActaClient.vcIssue}'s prepare mode that returns just
   * `{ xdr, network }` and throws if the server somehow returned a submit
   * response by mistake.
   */
  prepareIssueTx(args: {
    owner: string;
    vcId: string;
    vcData: string;
    issuer: string;
    issuerDid?: string;
    contractId?: string;
    sourcePublicKey?: string;
  }): Promise<TxPrepareResponse> {
    return this.vcIssue(args).then((r) => {
      if ("tx_id" in r) {
        throw new Error("Unexpected submit response in prepare mode");
      }
      if (!r.xdr || !r.network) {
        throw new Error(
          "Failed to prepare transaction: missing xdr or network"
        );
      }
      return { xdr: r.xdr, network: r.network };
    });
  }

  // -------------------------------------------------------------------------
  // Vault — reads
  // -------------------------------------------------------------------------

  /**
   * Verify a credential against the vault contract.
   * Returns one of `valid` / `revoked` / `invalid` / `unknown`.
   */
  vaultVerify(args: {
    owner: string;
    vcId: string;
    vaultContractId?: string;
    contractId?: string;
  }): Promise<VaultVerifyVcResponse> {
    const contractId = args.vaultContractId || args.contractId;
    return this.axios
      .post<VaultVerifyVcResponse>("/contracts/vault/verify-vc", {
        owner: args.owner,
        vcId: args.vcId,
        contractId,
      })
      .then((r) => r.data);
  }

  /**
   * Paginated list of VC IDs in an owner's vault. `offset` / `limit`
   * default to `0` / `50`. `limit` is capped at 200 by the API and the
   * contract (`MAX_LIST_LIMIT`).
   */
  vaultListVcIdsDirect(args: {
    owner: string;
    offset?: number;
    limit?: number;
    vaultContractId?: string;
    contractId?: string;
  }): Promise<VaultListVcIdsResponse> {
    const contractId = args.vaultContractId || args.contractId;
    return this.axios
      .post<VaultListVcIdsResponse>("/contracts/vault/list-vc-ids", {
        owner: args.owner,
        offset: args.offset,
        limit: args.limit,
        contractId,
      })
      .then((r) => r.data);
  }

  /** Read a credential payload directly from the vault. */
  vaultGetVcDirect(args: {
    owner: string;
    vcId: string;
    vaultContractId?: string;
    contractId?: string;
  }): Promise<VaultGetVcResponse> {
    const contractId = args.vaultContractId || args.contractId;
    return this.axios
      .post<VaultGetVcResponse>("/contracts/vault/get-vc", {
        owner: args.owner,
        vcId: args.vcId,
        contractId,
      })
      .then((r) => r.data);
  }

  /** Parent info for a linked credential. `null` if not linked. */
  vaultGetVcParent(args: {
    owner: string;
    vcId: string;
    vaultContractId?: string;
    contractId?: string;
  }): Promise<VaultGetVcParentResponse> {
    const contractId = args.vaultContractId || args.contractId;
    return this.axios
      .post<VaultGetVcParentResponse>("/contracts/vault/get-vc-parent", {
        owner: args.owner,
        vcId: args.vcId,
        contractId,
      })
      .then((r) => r.data);
  }

  /** O(1) count of active VCs in an owner's vault. */
  vaultVcCount(args: {
    owner: string;
    contractId?: string;
  }): Promise<VaultVcCountResponse> {
    const params: Record<string, string> = { owner: args.owner };
    if (args.contractId) params.contractId = args.contractId;
    return this.axios
      .get<VaultVcCountResponse>("/contracts/vault/vc-count", { params })
      .then((r) => r.data);
  }

  /** Paginated list of issuers currently authorised in `owner`'s vault. */
  vaultListAuthorizedIssuers(args: {
    owner: string;
    offset?: number;
    limit?: number;
    contractId?: string;
  }): Promise<VaultIssuerListResponse> {
    return this.getIssuerList("authorized", args);
  }

  /** Paginated list of issuers currently denied (revoked) in `owner`'s vault. */
  vaultListDeniedIssuers(args: {
    owner: string;
    offset?: number;
    limit?: number;
    contractId?: string;
  }): Promise<VaultIssuerListResponse> {
    return this.getIssuerList("denied", args);
  }

  /** O(1) count of authorised issuers in `owner`'s vault. */
  vaultAuthorizedIssuerCount(args: {
    owner: string;
    contractId?: string;
  }): Promise<VaultIssuerCountResponse> {
    return this.getIssuerCount("authorized", args);
  }

  /** O(1) count of denied issuers in `owner`'s vault. */
  vaultDeniedIssuerCount(args: {
    owner: string;
    contractId?: string;
  }): Promise<VaultIssuerCountResponse> {
    return this.getIssuerCount("denied", args);
  }

  /**
   * Combined vault metadata: `{ admin, did_uri, revoked, vc_count,
   * authorized_issuer_count }`. Saves the client four round-trips.
   */
  vaultMetadata(args: {
    owner: string;
    contractId?: string;
  }): Promise<VaultMetadataResponse> {
    const params: Record<string, string> = {};
    if (args.contractId) params.contractId = args.contractId;
    return this.axios
      .get<VaultMetadataResponse>(
        `/contracts/vault/${encodeURIComponent(args.owner)}`,
        { params }
      )
      .then((r) => r.data);
  }

  private getIssuerList(
    bucket: "authorized" | "denied",
    args: {
      owner: string;
      offset?: number;
      limit?: number;
      contractId?: string;
    }
  ): Promise<VaultIssuerListResponse> {
    const params: Record<string, string> = { owner: args.owner };
    if (args.offset !== undefined) params.offset = String(args.offset);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.contractId) params.contractId = args.contractId;
    return this.axios
      .get<VaultIssuerListResponse>(`/contracts/vault/issuers/${bucket}`, {
        params,
      })
      .then((r) => r.data);
  }

  private getIssuerCount(
    bucket: "authorized" | "denied",
    args: { owner: string; contractId?: string }
  ): Promise<VaultIssuerCountResponse> {
    const params: Record<string, string> = { owner: args.owner };
    if (args.contractId) params.contractId = args.contractId;
    return this.axios
      .get<VaultIssuerCountResponse>(
        `/contracts/vault/issuers/${bucket}/count`,
        { params }
      )
      .then((r) => r.data);
  }

  // -------------------------------------------------------------------------
  // Vault — mutations
  // -------------------------------------------------------------------------

  vaultCreate(
    payload:
      | {
          owner: string;
          didUri: string;
          sourcePublicKey?: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<VaultCreateResponse> {
    return this.axios
      .post<VaultCreateResponse>("/contracts/vault/create", payload)
      .then((r) => r.data);
  }

  vaultAuthorizeIssuer(
    payload:
      | {
          owner: string;
          issuer: string;
          sourcePublicKey?: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<VaultAuthorizeIssuerResponse> {
    return this.axios
      .post<VaultAuthorizeIssuerResponse>(
        "/contracts/vault/authorize-issuer",
        payload
      )
      .then((r) => r.data);
  }

  vaultAuthorizeIssuers(
    payload:
      | {
          owner: string;
          issuers: string[];
          sourcePublicKey: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<VaultAuthorizeIssuersResponse> {
    return this.axios
      .post<VaultAuthorizeIssuersResponse>(
        "/contracts/vault/authorize-issuers",
        payload
      )
      .then((r) => r.data);
  }

  vaultRevokeIssuerViaApi(
    payload:
      | {
          owner: string;
          issuer: string;
          sourcePublicKey?: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<VaultRevokeIssuerResponse> {
    return this.axios
      .post<VaultRevokeIssuerResponse>(
        "/contracts/vault/revoke-issuer",
        payload
      )
      .then((r) => r.data);
  }

  vaultRevokeVault(
    payload:
      | {
          owner: string;
          sourcePublicKey?: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<VaultRevokeVaultResponse> {
    return this.axios
      .post<VaultRevokeVaultResponse>("/contracts/vault/revoke-vault", payload)
      .then((r) => r.data);
  }

  /** Transfer the vault admin role to a new G... address. */
  vaultSetNewOwner(
    payload:
      | {
          owner: string;
          newOwner: string;
          sourcePublicKey: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<VaultSetNewOwnerResponse> {
    if ("signedXdr" in payload) {
      return this.axios
        .post<VaultSetNewOwnerResponse>(
          "/contracts/vault/set-new-owner",
          payload
        )
        .then((r) => r.data);
    }
    return this.axios
      .post<VaultSetNewOwnerResponse>("/contracts/vault/set-new-owner", {
        owner: payload.owner,
        new_owner: payload.newOwner,
        contractId: payload.contractId,
        sourcePublicKey: payload.sourcePublicKey,
      })
      .then((r) => r.data);
  }

  /** Move a VC from one owner's vault to another. */
  vaultPush(
    payload:
      | {
          fromOwner: string;
          toOwner: string;
          vcId: string;
          issuer: string;
          sourcePublicKey: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<VaultPushResponse> {
    return this.axios
      .post<VaultPushResponse>("/contracts/vault/push", payload)
      .then((r) => r.data);
  }

  // -------------------------------------------------------------------------
  // VC — mutations
  // -------------------------------------------------------------------------

  /** Issue a credential (stores in vault and marks as valid). */
  vcIssue(
    payload:
      | {
          owner: string;
          vcId: string;
          vcData: string;
          issuer: string;
          issuerDid?: string;
          sourcePublicKey?: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<VcIssueResponse> {
    return this.axios
      .post<VcIssueResponse>("/contracts/vc/issue", payload)
      .then((r) => r.data);
  }

  /** Issue a credential linked to a parent VC in another vault. */
  vcIssueLinked(
    payload:
      | {
          owner: string;
          vcId: string;
          vcData: string;
          issuer: string;
          issuerDid?: string;
          sourcePublicKey?: string;
          contractId?: string;
          parentOwner: string;
          parentVcId: string;
        }
      | { signedXdr: string }
  ): Promise<VcIssueLinkedResponse> {
    return this.axios
      .post<VcIssueLinkedResponse>("/contracts/vc/issue-linked", payload)
      .then((r) => r.data);
  }

  /**
   * Issue up to 5 VCs in a single transaction (`MAX_BATCH_SIZE`). The
   * contract takes one `require_auth` and one fee transfer for the whole
   * batch.
   */
  vcBatchIssue(
    payload:
      | {
          owner: string;
          issuer: string;
          issuerDid?: string;
          vcs: Array<{ vcId: string; vcData: string }>;
          sourcePublicKey?: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<VcBatchIssueResponse> {
    return this.axios
      .post<VcBatchIssueResponse>("/contracts/vc/batch-issue", payload)
      .then((r) => r.data);
  }

  /**
   * Revoke a credential. The contract requires `owner.require_auth()`, so
   * `owner` is mandatory in prepare mode and the resulting XDR MUST be
   * signed by the vault owner (relayer signatures do NOT satisfy the
   * authorisation).
   */
  revokeCredentialViaApi(
    payload:
      | {
          owner: string;
          vcId: string;
          date?: string;
          sourcePublicKey?: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<VcRevokeResponse> {
    return this.axios
      .post<VcRevokeResponse>("/contracts/vc/revoke", payload)
      .then((r) => r.data);
  }

  // -------------------------------------------------------------------------
  // Contract version
  // -------------------------------------------------------------------------

  getContractVersion(args?: {
    contractId?: string;
    sourcePublicKey?: string;
  }): Promise<ContractVersionResponse> {
    const params: Record<string, string> = {};
    if (args?.contractId) params.contractId = args.contractId;
    if (args?.sourcePublicKey) params.sourcePublicKey = args.sourcePublicKey;
    return this.axios
      .get<ContractVersionResponse>("/contracts/version", { params })
      .then((r) => r.data);
  }

  // -------------------------------------------------------------------------
  // Sponsored vault
  // -------------------------------------------------------------------------

  sponsoredVaultCreate(
    payload:
      | {
          sponsor: string;
          owner: string;
          didUri: string;
          sourcePublicKey: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<SponsoredVaultCreateResponse> {
    return this.axios
      .post<SponsoredVaultCreateResponse>(
        "/contracts/sponsored-vault/create",
        payload
      )
      .then((r) => r.data);
  }

  sponsoredVaultSetOpenToAll(
    payload:
      | {
          open: boolean;
          sourcePublicKey: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<SponsoredVaultSetOpenToAllResponse> {
    return this.axios
      .post<SponsoredVaultSetOpenToAllResponse>(
        "/contracts/sponsored-vault/open-to-all",
        payload
      )
      .then((r) => r.data);
  }

  getSponsoredVaultOpenToAll(args?: {
    contractId?: string;
    sourcePublicKey?: string;
  }): Promise<SponsoredVaultOpenToAllReadResponse> {
    const params: Record<string, string> = {};
    if (args?.contractId) params.contractId = args.contractId;
    if (args?.sourcePublicKey) params.sourcePublicKey = args.sourcePublicKey;
    return this.axios
      .get<SponsoredVaultOpenToAllReadResponse>(
        "/contracts/sponsored-vault/open-to-all",
        { params }
      )
      .then((r) => r.data);
  }

  sponsoredVaultAddSponsor(
    payload:
      | {
          sponsor: string;
          sourcePublicKey: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<SponsoredVaultAddSponsorResponse> {
    return this.axios
      .post<SponsoredVaultAddSponsorResponse>(
        "/contracts/sponsored-vault/add-sponsor",
        payload
      )
      .then((r) => r.data);
  }

  sponsoredVaultRemoveSponsor(
    payload:
      | {
          sponsor: string;
          sourcePublicKey: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<SponsoredVaultRemoveSponsorResponse> {
    return this.axios
      .post<SponsoredVaultRemoveSponsorResponse>(
        "/contracts/sponsored-vault/remove-sponsor",
        payload
      )
      .then((r) => r.data);
  }

  // -------------------------------------------------------------------------
  // Issuer registry (vc-issuer-registry, available API v1.2.0+)
  // -------------------------------------------------------------------------

  /** Register a new issuer (admin). */
  issuerRegistryAdd(
    payload:
      | {
          issuer: string;
          name?: string;
          did?: string;
          url?: string;
          sourcePublicKey: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<IssuerRegistryAddResponse> {
    return this.axios
      .post<IssuerRegistryAddResponse>(
        "/contracts/issuer-registry/issuer",
        payload
      )
      .then((r) => r.data);
  }

  /** Overwrite metadata (admin). Preserves the `allowed` flag. */
  issuerRegistrySetMetadata(
    issuer: string,
    payload:
      | {
          name?: string;
          did?: string;
          url?: string;
          sourcePublicKey: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<IssuerRegistrySetMetadataResponse> {
    return this.axios
      .patch<IssuerRegistrySetMetadataResponse>(
        `/contracts/issuer-registry/issuer/${encodeURIComponent(issuer)}/metadata`,
        payload
      )
      .then((r) => r.data);
  }

  /** Toggle the `allowed` flag (admin). */
  issuerRegistrySetAllowed(
    issuer: string,
    payload:
      | {
          allowed: boolean;
          sourcePublicKey: string;
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<IssuerRegistrySetAllowedResponse> {
    return this.axios
      .patch<IssuerRegistrySetAllowedResponse>(
        `/contracts/issuer-registry/issuer/${encodeURIComponent(issuer)}/allowed`,
        payload
      )
      .then((r) => r.data);
  }

  /** Hard-delete an issuer (admin). */
  issuerRegistryRemove(
    issuer: string,
    payload:
      | { sourcePublicKey: string; contractId?: string }
      | { signedXdr: string }
  ): Promise<IssuerRegistryRemoveResponse> {
    return this.axios
      .delete<IssuerRegistryRemoveResponse>(
        `/contracts/issuer-registry/issuer/${encodeURIComponent(issuer)}`,
        { data: payload }
      )
      .then((r) => r.data);
  }

  /** Full record for an issuer. Rejects with `issuer_not_found` if missing. */
  issuerRegistryGet(args: {
    issuer: string;
    contractId?: string;
  }): Promise<IssuerRecord> {
    const params: Record<string, string> = {};
    if (args.contractId) params.contractId = args.contractId;
    return this.axios
      .get<IssuerRecord>(
        `/contracts/issuer-registry/issuer/${encodeURIComponent(args.issuer)}`,
        { params }
      )
      .then((r) => r.data);
  }

  /** Cheap `{ allowed: boolean }` check. Unknown issuers return `false`. */
  issuerRegistryIsAllowed(args: {
    issuer: string;
    contractId?: string;
  }): Promise<IssuerRegistryIsAllowedResponse> {
    const params: Record<string, string> = {};
    if (args.contractId) params.contractId = args.contractId;
    return this.axios
      .get<IssuerRegistryIsAllowedResponse>(
        `/contracts/issuer-registry/issuer/${encodeURIComponent(args.issuer)}/allowed`,
        { params }
      )
      .then((r) => r.data);
  }

  /** `{ admin, version }` — useful to sanity-check the deployed contract. */
  issuerRegistryStatus(args?: {
    contractId?: string;
  }): Promise<IssuerRegistryStatusResponse> {
    const params: Record<string, string> = {};
    if (args?.contractId) params.contractId = args.contractId;
    return this.axios
      .get<IssuerRegistryStatusResponse>("/contracts/issuer-registry/status", {
        params,
      })
      .then((r) => r.data);
  }
}
