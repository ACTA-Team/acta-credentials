import axios, { AxiosInstance } from "axios";
import { baseURL } from "./types/types";
import { CreateCredentialPayload, CreateCredentialResponse } from "./types";
import { IssuerIdentityProvider } from "./identity/provider";
import type {
  IssuerIdentity,
  IssuerIdentityStorage,
  Signer,
} from "./identity/types";
import type {
  ConfigResponse,
  HealthResponse,
  TxPrepareResponse,
  TxSubmitResponse,
  VaultCreateResponse,
  VaultAuthorizeIssuerResponse,
  VaultRevokeIssuerResponse,
  VaultRevokeVaultResponse,
  VcIssueResponse,
  VcRevokeResponse,
  VaultListVcIdsResponse,
  VaultGetVcResponse,
  VaultVerifyVcResponse,
  ContractVersionResponse,
  VaultMigrateResponse,
  VaultPushResponse,
  VaultSetNewOwnerResponse,
  VaultAuthorizeIssuersResponse,
  SponsoredVaultCreateResponse,
  SponsoredVaultSetOpenToAllResponse,
  SponsoredVaultAddSponsorResponse,
  SponsoredVaultRemoveSponsorResponse,
  SponsoredVaultOpenToAllReadResponse,
} from "./types/api-responses";

/**
 * ACTA SDK HTTP client.
 *
 * Wraps ACTA API endpoints to issue, store, read, and verify credentials,
 * and to prepare transactions. The network is inferred from the `baseURL`.
 */
/**
 * Optional configuration for the issuer-identity layer. Passing nothing
 * uses sensible defaults (IndexedDB in browsers, in-memory in Node).
 */
export interface ActaClientIdentityOptions {
  /** Custom storage backend for persisted issuer DIDs. */
  readonly storage?: IssuerIdentityStorage;
  /** Override the Stellar RPC URL used during DID registration. */
  readonly rpcUrl?: string;
  /** Override the `did-stellar-registry` contract ID. */
  readonly registryContractId?: string;
  /** Allow `http://` RPC URLs (dev only). */
  readonly allowHttp?: boolean;
}

export class ActaClient {
  private axios: AxiosInstance;
  private network: "mainnet" | "testnet";
  private configCache: ConfigResponse | null = null;
  private issuerIdentityProvider: IssuerIdentityProvider;

  /**
   * Initialize a new client instance.
   * @param baseURL - Base API URL for ACTA services (mainnet or testnet).
   * @param apiKey - API key for authentication. If not provided, will be read from environment variables.
   * @throws Error if API key is not provided and environment variable is not set for the network.
   *
   * The API key is required and must be provided either as a parameter or via environment variables.
   * It is automatically configured in the X-ACTA-Key header for all requests.
   *
   * API keys are network-specific. Set in your .env file:
   * - ACTA_API_KEY_MAINNET=your-mainnet-api-key (for mainnet)
   * - ACTA_API_KEY_TESTNET=your-testnet-api-key (for testnet)
   *
   * Or use ACTA_API_KEY as fallback for both networks:
   * - ACTA_API_KEY=your-api-key (works for both networks)
   */
  constructor(
    baseURL: baseURL,
    apiKey?: string,
    identityOptions?: ActaClientIdentityOptions
  ) {
    this.axios = axios.create({ baseURL });
    this.network = baseURL.includes("mainnet") ? "mainnet" : "testnet";
    this.issuerIdentityProvider = new IssuerIdentityProvider({
      network: this.network,
      ...(identityOptions?.storage ? { storage: identityOptions.storage } : {}),
      ...(identityOptions?.rpcUrl ? { rpcUrl: identityOptions.rpcUrl } : {}),
      ...(identityOptions?.registryContractId
        ? { registryContractId: identityOptions.registryContractId }
        : {}),
      ...(identityOptions?.allowHttp !== undefined
        ? { allowHttp: identityOptions.allowHttp }
        : {}),
    });

    // Use provided API key, or read from environment variable (network-specific or fallback)
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

    // Configure interceptor to automatically add API key header to all requests
    this.axios.interceptors.request.use((config) => {
      config.headers = config.headers || {};
      config.headers["X-ACTA-Key"] = finalApiKey.trim();
      return config;
    });
  }

  /**
   * @deprecated Use vcIssue endpoint instead. This method is kept for backward compatibility but will be removed.
   * Create a new credential
   */
  createCredential(data: CreateCredentialPayload) {
    throw new Error(
      "createCredential is deprecated. Use vcIssue endpoint via useCreateCredential hook instead."
    );
  }

  /**
   * Get the network type (mainnet or testnet).
   * @returns Network type: "mainnet" or "testnet"
   */
  getNetwork(): "mainnet" | "testnet" {
    return this.network;
  }

  /**
   * Get or create the `did:stellar` issuer identity for the given
   * controller account. Creates and registers a new DID on-chain the
   * first time it is called for a given controller, and returns the
   * persisted identity on every subsequent call.
   *
   * The integrator only ever provides:
   *   - the Stellar controller account (`G...`)
   *   - a function that signs the registration transaction with that
   *     account's wallet (Freighter, Albedo, hardware, etc.)
   *
   * Everything else — Ed25519 keypair generation, Multikey encoding,
   * `did-stellar-registry` invocation, private-key custody — happens
   * inside the SDK.
   */
  getOrCreateIssuerIdentity(args: {
    controller: string;
    signTransaction: Signer;
  }): Promise<IssuerIdentity> {
    return this.issuerIdentityProvider.getOrCreate(args);
  }

  /**
   * Look up the persisted issuer identity for `controller` without
   * triggering any on-chain registration. Returns `null` when nothing
   * has been stored yet.
   */
  getIssuerIdentity(controller: string): Promise<IssuerIdentity | null> {
    return this.issuerIdentityProvider.get(controller);
  }

  /**
   * Get service health status.
   * @returns Service status, timestamp, and environment info.
   */
  getHealth(): Promise<HealthResponse> {
    return this.axios.get<HealthResponse>("/health").then((r) => r.data);
  }

  /**
   * Get configuration from the API.
   * @returns Configuration: `rpcUrl`, `networkPassphrase`, `actaContractId`.
   * @throws Error if the API is unavailable.
   */
  async getConfig(): Promise<ConfigResponse> {
    if (this.configCache) {
      return this.configCache;
    }

    const response = await this.axios.get<ConfigResponse>("/config");

    this.configCache = response.data;
    return this.configCache;
  }

  /**
   * Get default runtime configuration from the API.
   * @deprecated Use `getConfig()` instead. This method is kept for backward compatibility.
   * @returns Configuration from the API: `rpcUrl`, `networkPassphrase`, `actaContractId`.
   */
  async getDefaults() {
    const config = await this.getConfig();
    return {
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.networkPassphrase,
      actaContractId: config.actaContractId,
      // Legacy support - map to actaContractId
      issuanceContractId: config.actaContractId,
      vaultContractId: config.actaContractId,
    };
  }

  /**
   * Prepare an unsigned XDR to issue a credential (which stores it in the vault).
   * Uses the same endpoint as vcIssue but only prepares the transaction.
   * @param args - Arguments describing the credential details:
   *   - owner: Stellar account address (public key) that owns the credential vault
   *   - vcId: Unique identifier for the credential
   *   - vcData: JSON string containing the credential data/claims. MUST include "@context" field with at least:
   *     ["https://www.w3.org/ns/credentials/v2", "https://www.w3.org/ns/credentials/examples/v2"]
   *   - issuer: Stellar account address (public key) of the credential issuer (who creates the credential)
   *   - issuerDid: Issuer DID. Must be a valid did:stellar registered on-chain.
   *   - sourcePublicKey: Optional signer account (defaults to issuer for G-address owners)
   *   - contractId: Optional contract ID (defaults to network contract)
   * @returns `{ xdr, network }` to be signed by the caller.
   */
  prepareIssueTx(args: {
    /** Stellar account address (public key) that owns the credential vault */
    owner: string;

    /** Unique identifier for the credential */
    vcId: string;

    /** JSON string containing the credential data/claims. MUST include "@context" field with at least: ["https://www.w3.org/ns/credentials/v2", "https://www.w3.org/ns/credentials/examples/v2"] */
    vcData: string;

    /** Stellar account address (public key) of the credential issuer (who creates the credential) */
    issuer: string;

    /** Issuer DID. Must be a valid did:stellar registered on-chain. */
    issuerDid?: string;

    /** Optional contract ID (defaults to network contract) */
    contractId?: string;

    /** Stellar public key that will sign the transaction (G...).
     *  Optional: when omitted and owner is a smart account (C...), the backend uses the relayer. */
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
      return {
        xdr: r.xdr,
        network: r.network,
      };
    });
  }

  /**
   * @deprecated Use vcIssue endpoint directly. This method is kept for backward compatibility.
   * Prepare an unsigned XDR to store a credential in the Vault.
   * Note: Storing is done via vcIssue which stores and marks as valid.
   */
  prepareStoreTx(args: {
    /** Stellar account address (public key) that owns the credential vault */
    owner: string;

    /** Unique identifier for the credential */
    vcId: string;

    /** DID URI of the credential owner */
    didUri: string;

    /** Credential data fields */
    fields: Record<string, unknown>;

    /** Optional vault contract ID (defaults to network contract) */
    vaultContractId?: string;

    /** Optional Stellar account address (public key) of the credential issuer */
    issuer?: string;
  }) {
    // Store is handled by vcIssue, so we redirect to that
    if (!args.issuer) {
      throw new Error("Issuer is required to issue/store a credential");
    }
    return this.prepareIssueTx({
      owner: args.owner,
      vcId: args.vcId,
      vcData: JSON.stringify(args.fields),
      issuer: args.issuer,
      contractId: args.vaultContractId,
      sourcePublicKey: args.owner,
    });
  }

  /**
   * @deprecated These are read operations, not prepare operations. Use vaultListVcIdsDirect instead.
   * List VC IDs from the Vault (read operation, no XDR needed).
   */
  prepareListVcIdsTx(args: {
    /** Stellar account address (public key) that owns the credential vault */
    owner: string;

    /** Optional vault contract ID (defaults to network contract) */
    vaultContractId?: string;
  }) {
    return this.vaultListVcIdsDirect(args).then(() => {
      throw new Error(
        "prepareListVcIdsTx is deprecated. Use vaultListVcIdsDirect for read operations."
      );
    });
  }

  /**
   * @deprecated These are read operations, not prepare operations. Use vaultGetVcDirect instead.
   * Fetch a VC from the Vault (read operation, no XDR needed).
   */
  prepareGetVcTx(args: {
    /** Stellar account address (public key) that owns the credential vault */
    owner: string;

    /** Unique identifier for the credential */
    vcId: string;

    /** Optional vault contract ID (defaults to network contract) */
    vaultContractId?: string;
  }) {
    return this.vaultGetVcDirect(args).then(() => {
      throw new Error(
        "prepareGetVcTx is deprecated. Use vaultGetVcDirect for read operations."
      );
    });
  }

  /**
   * @deprecated Storing is handled automatically by vcIssue. Use vcIssue endpoint instead.
   * Submit a signed XDR to store a credential in the Vault.
   */
  vaultStore(payload: {
    /** Signed XDR transaction string */
    signedXdr: string;

    /** Unique identifier for the credential */
    vcId: string;

    /** Optional Stellar account address (public key) that owns the credential vault */
    owner?: string;

    /** Optional vault contract ID (defaults to network contract) */
    vaultContractId?: string;
  }) {
    throw new Error(
      "vaultStore is deprecated. Credentials are stored automatically when issued via vcIssue. Use useIssueCredential hook instead."
    );
  }

  /**
   * Verify a credential against the Vault contract.
   * @param args - Credential verification details
   * @returns Verification result with `status` and optional `since`.
   */
  vaultVerify(args: {
    /** Stellar account address (public key) that owns the credential vault */
    owner: string;

    /** Unique identifier for the credential */
    vcId: string;

    /** Optional vault contract ID (defaults to network contract) */
    vaultContractId?: string;

    /** Optional contract ID (defaults to network contract, alternative to vaultContractId) */
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
   * List credential IDs directly from the Vault contract.
   * @param args - Vault listing details
   * @returns `{ vc_ids }` or `{ result }` with IDs.
   */
  vaultListVcIdsDirect(args: {
    /** Stellar account address (public key) that owns the credential vault */
    owner: string;

    /** Optional vault contract ID (defaults to network contract) */
    vaultContractId?: string;

    /** Optional contract ID (defaults to network contract, alternative to vaultContractId) */
    contractId?: string;
  }): Promise<VaultListVcIdsResponse> {
    const contractId = args.vaultContractId || args.contractId;
    return this.axios
      .post<VaultListVcIdsResponse>("/contracts/vault/list-vc-ids", {
        owner: args.owner,
        contractId,
      })
      .then((r) => r.data);
  }

  /**
   * Read a credential directly from the Vault contract.
   * @param args - Credential retrieval details
   * @returns `{ vc }` or `{ result }` with credential contents.
   */
  vaultGetVcDirect(args: {
    /** Stellar account address (public key) that owns the credential vault */
    owner: string;

    /** Unique identifier for the credential */
    vcId: string;

    /** Optional vault contract ID (defaults to network contract) */
    vaultContractId?: string;

    /** Optional contract ID (defaults to network contract, alternative to vaultContractId) */
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

  /**
   * Create (initialize) a vault for an owner via the API.
   * Can prepare an unsigned XDR or submit a signed XDR.
   * @param payload - Either prepare mode with vault creation details, or submit mode with signed XDR
   * @returns Prepare mode: `{ xdr, network }` or Submit mode: `{ tx_id }`
   */
  vaultCreate(
    payload:
      | {
          /** Stellar account address (public key) that will own the vault */
          owner: string;

          /** DID URI of the vault owner */
          didUri: string;

          /** Stellar public key that will sign the transaction (G...).
           *  Optional: when omitted and owner is a smart account (C...), the backend uses the relayer. */
          sourcePublicKey?: string;

          /** Optional contract ID (defaults to network contract) */
          contractId?: string;

          /** Optional salt used to derive the owner's single-tenant vault. */
          userSalt?: string;
        }
      | { signedXdr: string }
  ): Promise<VaultCreateResponse> {
    return this.axios
      .post<VaultCreateResponse>("/contracts/vault/create", payload)
      .then((r) => r.data);
  }

  /**
   * Authorize an issuer in a vault via the API.
   * Can prepare an unsigned XDR or submit a signed XDR.
   * @param payload - Either prepare mode with authorization details, or submit mode with signed XDR
   * @returns Prepare mode: `{ xdr, network }` or Submit mode: `{ tx_id }`
   */
  vaultAuthorizeIssuer(
    payload:
      | {
          /** Stellar account address (public key) that owns the vault */
          owner: string;

          /** Stellar account address (public key) of the issuer to authorize */
          issuer: string;

          /** Stellar public key that will sign the transaction (G...).
           *  Optional: when omitted and owner is a smart account (C...), the backend uses the relayer. */
          sourcePublicKey?: string;

          /** Optional contract ID (defaults to network contract) */
          contractId?: string;

          /** Optional salt used to derive the owner's single-tenant vault. */
          userSalt?: string;
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

  /**
   * Deny an issuer in a vault via the API (`POST /contracts/vault/deny-issuer`).
   * Can prepare an unsigned XDR or submit a signed XDR.
   * @param payload - Either prepare mode with deny details, or submit mode with signed XDR
   * @returns Prepare mode: `{ xdr, network }` or Submit mode: `{ tx_id }`
   */
  vaultDenyIssuer(
    payload:
      | {
          /** Stellar account address (public key) that owns the vault */
          owner: string;

          /** Stellar account address (public key) of the issuer to deny */
          issuer: string;

          /** Stellar public key that will sign the transaction (G...).
           *  Optional: when omitted and owner is a smart account (C...), the backend uses the relayer. */
          sourcePublicKey?: string;

          /** Optional contract ID (defaults to network contract) */
          contractId?: string;

          /** Optional salt used to derive the owner's single-tenant vault. */
          userSalt?: string;
        }
      | { signedXdr: string }
  ): Promise<VaultAuthorizeIssuerResponse> {
    return this.axios
      .post<VaultAuthorizeIssuerResponse>(
        "/contracts/vault/deny-issuer",
        payload
      )
      .then((r) => r.data);
  }

  /**
   * Allow an issuer in a vault via the API (`POST /contracts/vault/allow-issuer`).
   * Can prepare an unsigned XDR or submit a signed XDR.
   * @param payload - Either prepare mode with allow details, or submit mode with signed XDR
   * @returns Prepare mode: `{ xdr, network }` or Submit mode: `{ tx_id }`
   */
  vaultAllowIssuer(
    payload:
      | {
          /** Stellar account address (public key) that owns the vault */
          owner: string;

          /** Stellar account address (public key) of the issuer to allow */
          issuer: string;

          /** Stellar public key that will sign the transaction (G...).
           *  Optional: when omitted and owner is a smart account (C...), the backend uses the relayer. */
          sourcePublicKey?: string;

          /** Optional contract ID (defaults to network contract) */
          contractId?: string;

          /** Optional salt used to derive the owner's single-tenant vault. */
          userSalt?: string;
        }
      | { signedXdr: string }
  ): Promise<VaultAuthorizeIssuerResponse> {
    return this.axios
      .post<VaultAuthorizeIssuerResponse>(
        "/contracts/vault/allow-issuer",
        payload
      )
      .then((r) => r.data);
  }

  /**
   * Revoke a credential via the API.
   * Can prepare an unsigned XDR or submit a signed XDR.
   * @param payload - Either prepare mode with revocation details, or submit mode with signed XDR
   * @returns Prepare mode: `{ xdr, network }` or Submit mode: `{ tx_id }`
   */
  revokeCredentialViaApi(
    payload:
      | {
          /** Stellar account address (public key) that owns the credential vault.
           *  Required so the API can derive the owner's single-tenant vault for `vc-vault.revoke`. */
          owner: string;

          /** Unique identifier for the credential to revoke */
          vcId: string;

          /** Optional revocation date (ISO timestamp, defaults to current time) */
          date?: string;

          /** Stellar public key that will sign the transaction (G...).
           *  Optional: when omitted, the backend uses the relayer when configured. */
          sourcePublicKey?: string;

          /** Optional contract ID (defaults to network contract) */
          contractId?: string;

          /** Optional salt used to derive the owner's single-tenant vault. */
          userSalt?: string;
        }
      | { signedXdr: string }
  ): Promise<VcRevokeResponse> {
    return this.axios
      .post<VcRevokeResponse>("/contracts/vc/revoke", payload)
      .then((r) => r.data);
  }

  /**
   * Revoke (disable) a vault for an owner via the API.
   * Can prepare an unsigned XDR or submit a signed XDR.
   * @param payload - Either prepare mode with vault revocation details, or submit mode with signed XDR
   * @returns Prepare mode: `{ xdr, network }` or Submit mode: `{ tx_id }`
   */
  vaultRevokeVault(
    payload:
      | {
          /** Stellar account address (public key) that owns the vault */
          owner: string;

          /** Stellar public key that will sign the transaction (G...).
           *  Optional: when omitted and owner is a smart account (C...), the backend uses the relayer. */
          sourcePublicKey?: string;

          /** Optional contract ID (defaults to network contract) */
          contractId?: string;

          /** Optional salt used to derive the owner's single-tenant vault. */
          userSalt?: string;
        }
      | { signedXdr: string }
  ): Promise<VaultRevokeVaultResponse> {
    return this.axios
      .post<VaultRevokeVaultResponse>("/contracts/vault/revoke-vault", payload)
      .then((r) => r.data);
  }

  /**
   * Revoke (remove) an authorized issuer from a vault via the API.
   * Can prepare an unsigned XDR or submit a signed XDR.
   * @param payload - Either prepare mode with issuer revocation details, or submit mode with signed XDR
   * @returns Prepare mode: `{ xdr, network }` or Submit mode: `{ tx_id }`
   */
  vaultRevokeIssuerViaApi(
    payload:
      | {
          /** Stellar account address (public key) that owns the vault */
          owner: string;

          /** Stellar account address (public key) of the issuer to revoke */
          issuer: string;

          /** Stellar public key that will sign the transaction (G...).
           *  Optional: when omitted and owner is a smart account (C...), the backend uses the relayer. */
          sourcePublicKey?: string;

          /** Optional contract ID (defaults to network contract) */
          contractId?: string;

          /** Optional salt used to derive the owner's single-tenant vault. */
          userSalt?: string;
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

  /**
   * Issue a credential via the API (stores in vault and marks as valid).
   * Can prepare an unsigned XDR or submit a signed XDR.
   * @param payload - Either prepare mode with credential details, or submit mode with signed XDR:
   *   - owner: Stellar account address (public key) that owns the credential vault
   *   - vcId: Unique identifier for the credential
   *   - vcData: JSON string containing the credential data/claims. MUST include "@context" field with at least:
   *     ["https://www.w3.org/ns/credentials/v2", "https://www.w3.org/ns/credentials/examples/v2"]
   *   - issuer: Stellar account address (public key) of the credential issuer (who creates the credential)
   *   - issuerDid: Issuer DID. Must be a valid did:stellar registered on-chain.
   *   - sourcePublicKey: Stellar public key that will sign the transaction (optional for contract owners; defaults to issuer for G-address owners)
   *   - contractId: Optional contract ID (defaults to network contract)
   *   - signedXdr: For submit mode, the signed XDR transaction string
   * @returns Prepare mode: `{ xdr, network }` or Submit mode: `{ tx_id }`
   */
  vcIssue(
    payload:
      | {
          /** Stellar account address (public key) that owns the credential vault */
          owner: string;

          /** Unique identifier for the credential */
          vcId: string;

          /** JSON string containing the credential data/claims. MUST include "@context" field with at least: ["https://www.w3.org/ns/credentials/v2", "https://www.w3.org/ns/credentials/examples/v2"] */
          vcData: string;

          /** Stellar account address (public key) of the credential issuer (who creates the credential) */
          issuer: string;

          /** Issuer DID. Must be a valid did:stellar registered on-chain. */
          issuerDid?: string;

          /** Stellar public key that will sign the transaction (G...).
           *  Optional: when omitted and owner is a smart account (C...), the backend uses the relayer. */
          sourcePublicKey?: string;

          /** Optional contract ID (defaults to network contract) */
          contractId?: string;

          /** Optional salt used to derive the owner's single-tenant vault. */
          userSalt?: string;
        }
      | { signedXdr: string }
  ): Promise<VcIssueResponse> {
    return this.axios
      .post<VcIssueResponse>("/contracts/vc/issue", payload)
      .then((r) => r.data);
  }

  /**
   * Read the ACTA contract version string.
   * @param args - Optional contract and source configuration
   * @returns `{ version }` with the contract version.
   */
  getContractVersion(args?: {
    /** Optional contract ID override (defaults to network contract) */
    contractId?: string;

    /** Optional source public key used for Soroban simulation */
    sourcePublicKey?: string;

    /** Optional owner (public key) whose single-tenant vault version should be read. */
    owner?: string;
  }): Promise<ContractVersionResponse> {
    const params: Record<string, string> = {};
    if (args?.contractId) params.contractId = args.contractId;
    if (args?.sourcePublicKey) params.sourcePublicKey = args.sourcePublicKey;
    if (args?.owner) params.owner = args.owner;

    return this.axios
      .get<ContractVersionResponse>("/contracts/version", { params })
      .then((r) => r.data);
  }

  /**
   * Migrate legacy vault data for an owner to the current format.
   * Can prepare an unsigned XDR or submit a signed XDR.
   * @param payload - Either prepare mode with migration details, or submit mode with signed XDR
   * @returns Prepare mode: `{ xdr, network }` or Submit mode: `{ tx_id }`
   */
  vaultMigrate(
    payload:
      | {
          /** Stellar account address (public key) that owns the vault */
          owner: string;

          /** Optional contract ID (defaults to network contract) */
          contractId?: string;

          /** Stellar public key that will sign the transaction */
          sourcePublicKey: string;
        }
      | { signedXdr: string }
  ): Promise<VaultMigrateResponse> {
    return this.axios
      .post<VaultMigrateResponse>("/contracts/vault/migrate", payload)
      .then((r) => r.data);
  }

  /**
   * Replace the full authorized issuer list for an owner's vault.
   * Can prepare an unsigned XDR or submit a signed XDR.
   * @param payload - Either prepare mode with authorization details, or submit mode with signed XDR
   * @returns Prepare mode: `{ xdr, network }` or Submit mode: `{ tx_id }`
   */
  vaultAuthorizeIssuers(
    payload:
      | {
          /** Stellar account address (public key) that owns the vault */
          owner: string;

          /** Array of issuer addresses (public keys) to authorize */
          issuers: string[];

          /** Stellar public key that will sign the transaction */
          sourcePublicKey: string;

          /** Optional contract ID (defaults to network contract) */
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

  /**
   * Set a new vault owner (vault admin) for an existing vault.
   * Can prepare an unsigned XDR or submit a signed XDR.
   * @param payload - Either prepare mode with ownership details, or submit mode with signed XDR
   * @returns Prepare mode: `{ xdr, network }` or Submit mode: `{ tx_id }`
   */
  vaultSetNewOwner(
    payload:
      | {
          /** Current vault owner address (public key) */
          owner: string;

          /** New vault owner address (public key) */
          newOwner: string;

          /** Stellar public key that will sign the transaction (must be current vault admin) */
          sourcePublicKey: string;

          /** Optional contract ID (defaults to network contract) */
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<VaultSetNewOwnerResponse> {
    if ("signedXdr" in payload) {
      return this.axios
        .post<VaultSetNewOwnerResponse>("/contracts/vault/set-new-owner", payload)
        .then((r) => r.data);
    }

    const body = {
      owner: payload.owner,
      new_owner: payload.newOwner,
      contractId: payload.contractId,
      sourcePublicKey: payload.sourcePublicKey,
    };

    return this.axios
      .post<VaultSetNewOwnerResponse>("/contracts/vault/set-new-owner", body)
      .then((r) => r.data);
  }

  /**
   * Move a VC from one owner's vault to another.
   * Can prepare an unsigned XDR or submit a signed XDR.
   * @param payload - Either prepare mode with push details, or submit mode with signed XDR
   * @returns Prepare mode: `{ xdr, network }` or Submit mode: `{ tx_id }`
   */
  vaultPush(
    payload:
      | {
          /** Origin vault owner address (public key) */
          fromOwner: string;

          /** Destination vault owner address (public key) */
          toOwner: string;

          /** Credential identifier */
          vcId: string;

          /** Issuer address (public key) authorized in the origin vault */
          issuer: string;

          /** Stellar public key that will sign the transaction (must be fromOwner) */
          sourcePublicKey: string;

          /** Optional contract ID (defaults to network contract) */
          contractId?: string;
        }
      | { signedXdr: string }
  ): Promise<VaultPushResponse> {
    return this.axios
      .post<VaultPushResponse>("/contracts/vault/push", payload)
      .then((r) => r.data);
  }

  /**
   * Create a sponsored vault for an owner.
   * Can prepare an unsigned XDR or submit a signed XDR.
   * @param payload - Either prepare mode with sponsored vault details, or submit mode with signed XDR
   * @returns Prepare mode: `{ xdr, network }` or Submit mode: `{ tx_id }`
   */
  sponsoredVaultCreate(
    payload:
      | {
          /** Sponsor address (public key) that pays for the vault creation */
          sponsor: string;

          /** Vault owner address (public key) */
          owner: string;

          /** DID URI of the vault owner */
          didUri: string;

          /** Stellar public key that will sign the transaction (must be sponsor) */
          sourcePublicKey: string;

          /** Optional contract ID (defaults to network contract) */
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

  /**
   * Set the sponsored vault open_to_all flag.
   * Can prepare an unsigned XDR or submit a signed XDR.
   * @param payload - Either prepare mode with flag details, or submit mode with signed XDR
   * @returns Prepare mode: `{ xdr, network }` or Submit mode: `{ tx_id }`
   */
  sponsoredVaultSetOpenToAll(
    payload:
      | {
          /** Whether sponsored vaults are open to all (true) or restricted (false) */
          open: boolean;

          /** Stellar public key that will sign the transaction */
          sourcePublicKey: string;

          /** Optional contract ID (defaults to network contract) */
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

  /**
   * Read the sponsored vault open_to_all flag.
   * @param args - Optional contract and source configuration
   * @returns `{ open }` flag indicating if sponsored vaults are open to all.
   */
  getSponsoredVaultOpenToAll(args?: {
    /** Optional contract ID override (defaults to network contract) */
    contractId?: string;

    /** Optional source public key used for Soroban simulation */
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

  /**
   * Add a sponsor address to the sponsored vault sponsors list.
   * Can prepare an unsigned XDR or submit a signed XDR.
   * @param payload - Either prepare mode with sponsor details, or submit mode with signed XDR
   * @returns Prepare mode: `{ xdr, network }` or Submit mode: `{ tx_id }`
   */
  sponsoredVaultAddSponsor(
    payload:
      | {
          /** Sponsor address (public key) to add */
          sponsor: string;

          /** Stellar public key that will sign the transaction */
          sourcePublicKey: string;

          /** Optional contract ID (defaults to network contract) */
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

  /**
   * Remove a sponsor address from the sponsored vault sponsors list.
   * Can prepare an unsigned XDR or submit a signed XDR.
   * @param payload - Either prepare mode with sponsor details, or submit mode with signed XDR
   * @returns Prepare mode: `{ xdr, network }` or Submit mode: `{ tx_id }`
   */
  sponsoredVaultRemoveSponsor(
    payload:
      | {
          /** Sponsor address (public key) to remove */
          sponsor: string;

          /** Stellar public key that will sign the transaction */
          sourcePublicKey: string;

          /** Optional contract ID (defaults to network contract) */
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
}
