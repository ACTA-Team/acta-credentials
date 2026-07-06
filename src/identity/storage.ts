/**
 * Default storage implementations for issuer identities.
 *
 * - `InMemoryIssuerIdentityStorage` — process-local map. Default in Node
 *   environments and as a fallback when no other backend is configured.
 * - `IndexedDbIssuerIdentityStorage` — browser-only, persists across tabs and
 *   reloads. The Ed25519 assertion private key is encrypted at rest with
 *   AES-256-GCM using a **non-extractable** WebCrypto key kept in IndexedDB, so
 *   the raw key never sits in the database in plaintext. (Note: this defends
 *   against passive exfiltration — backups, another origin, dev-tools dumps —
 *   but an attacker running code on the same origin, e.g. via XSS, can still
 *   use the key handle to sign. Keep your origin XSS-free.)
 *
 * Integrators with custom requirements (KMS, encrypted file, hardware wallet)
 * implement {@link IssuerIdentityStorage} themselves and pass it to the client.
 */

import type { IssuerIdentity, IssuerIdentityStorage } from "./types";

/** Process-local map. State is lost when the process exits. */
export class InMemoryIssuerIdentityStorage implements IssuerIdentityStorage {
  private readonly store = new Map<string, IssuerIdentity>();

  async get(
    controller: string,
    network: "mainnet" | "testnet"
  ): Promise<IssuerIdentity | null> {
    return this.store.get(this.key(controller, network)) ?? null;
  }

  async set(
    identity: IssuerIdentity,
    network: "mainnet" | "testnet"
  ): Promise<void> {
    this.store.set(this.key(identity.controller, network), identity);
  }

  private key(controller: string, network: "mainnet" | "testnet"): string {
    return `${network}:${controller}`;
  }
}

/** Envelope for the AES-GCM encrypted private key (base64url iv + ciphertext). */
interface EncryptedField {
  iv: string;
  data: string;
}

/** On-disk record: the private key is replaced by an encrypted envelope. */
type StoredRecord = Omit<IssuerIdentity, "assertionPrivateKeyHex"> & {
  assertionPrivateKeyHex?: string;
  _encPk?: EncryptedField;
};

function subtle(): SubtleCrypto | null {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c && typeof c.subtle !== "undefined" ? c.subtle : null;
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] as number);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * Browser-only storage backed by IndexedDB. Falls back to throwing on
 * unsupported runtimes — callers MUST check {@link isIndexedDbAvailable}
 * first or use {@link autoSelectStorage}.
 */
export class IndexedDbIssuerIdentityStorage implements IssuerIdentityStorage {
  private static readonly DB_NAME = "acta-issuer-identity";
  private static readonly STORE_NAME = "identities";
  private static readonly KEY_STORE_NAME = "crypto-keys";
  private static readonly AES_KEY_ID = "assertion-key-aes-gcm";
  private static readonly DB_VERSION = 2;

  private static warnedNoCrypto = false;

  async get(
    controller: string,
    network: "mainnet" | "testnet"
  ): Promise<IssuerIdentity | null> {
    const db = await this.openDb();
    try {
      const record = await new Promise<StoredRecord | null>((resolve, reject) => {
        const tx = db.transaction(IndexedDbIssuerIdentityStorage.STORE_NAME, "readonly");
        const store = tx.objectStore(IndexedDbIssuerIdentityStorage.STORE_NAME);
        const req = store.get(this.key(controller, network));
        req.onsuccess = () => resolve((req.result as StoredRecord | undefined) ?? null);
        req.onerror = () => reject(req.error);
      });
      if (!record) return null;
      return await this.decryptRecord(db, record);
    } finally {
      db.close();
    }
  }

  async set(
    identity: IssuerIdentity,
    network: "mainnet" | "testnet"
  ): Promise<void> {
    const db = await this.openDb();
    try {
      const record = await this.encryptRecord(db, identity);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IndexedDbIssuerIdentityStorage.STORE_NAME, "readwrite");
        const store = tx.objectStore(IndexedDbIssuerIdentityStorage.STORE_NAME);
        const req = store.put(record, this.key(identity.controller, network));
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  private async encryptRecord(
    db: IDBDatabase,
    identity: IssuerIdentity
  ): Promise<StoredRecord> {
    const s = subtle();
    if (!s) {
      IndexedDbIssuerIdentityStorage.warnNoCrypto();
      return { ...identity };
    }
    const key = await this.getOrCreateAesKey(db, s);
    const iv = (globalThis.crypto as Crypto).getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(identity.assertionPrivateKeyHex);
    const ct = new Uint8Array(
      await s.encrypt(
        { name: "AES-GCM", iv: iv as unknown as BufferSource },
        key,
        plaintext as unknown as BufferSource
      )
    );
    const { assertionPrivateKeyHex: _omit, ...rest } = identity;
    void _omit;
    return { ...rest, _encPk: { iv: toB64(iv), data: toB64(ct) } };
  }

  private async decryptRecord(
    db: IDBDatabase,
    record: StoredRecord
  ): Promise<IssuerIdentity> {
    if (!record._encPk) {
      // Legacy plaintext record (written before at-rest encryption).
      return record as IssuerIdentity;
    }
    const s = subtle();
    if (!s) throw new Error("WebCrypto unavailable: cannot decrypt stored issuer key");
    const key = await this.getOrCreateAesKey(db, s);
    const iv = fromB64(record._encPk.iv);
    const ct = fromB64(record._encPk.data);
    const pt = new Uint8Array(
      await s.decrypt(
        { name: "AES-GCM", iv: iv as unknown as BufferSource },
        key,
        ct as unknown as BufferSource
      )
    );
    const assertionPrivateKeyHex = new TextDecoder().decode(pt);
    const { _encPk: _drop, ...rest } = record;
    void _drop;
    return { ...rest, assertionPrivateKeyHex } as IssuerIdentity;
  }

  private async getOrCreateAesKey(db: IDBDatabase, s: SubtleCrypto): Promise<CryptoKey> {
    const existing = await new Promise<CryptoKey | null>((resolve, reject) => {
      const tx = db.transaction(IndexedDbIssuerIdentityStorage.KEY_STORE_NAME, "readonly");
      const store = tx.objectStore(IndexedDbIssuerIdentityStorage.KEY_STORE_NAME);
      const req = store.get(IndexedDbIssuerIdentityStorage.AES_KEY_ID);
      req.onsuccess = () => resolve((req.result as CryptoKey | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    if (existing) return existing;

    // Non-extractable: the key cannot be exported/exfiltrated, only used.
    const key = await s.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IndexedDbIssuerIdentityStorage.KEY_STORE_NAME, "readwrite");
      const store = tx.objectStore(IndexedDbIssuerIdentityStorage.KEY_STORE_NAME);
      const req = store.put(key, IndexedDbIssuerIdentityStorage.AES_KEY_ID);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    return key;
  }

  private static warnNoCrypto(): void {
    if (IndexedDbIssuerIdentityStorage.warnedNoCrypto) return;
    IndexedDbIssuerIdentityStorage.warnedNoCrypto = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[acta] WebCrypto (crypto.subtle) is unavailable; the issuer private key " +
        "will be stored WITHOUT at-rest encryption. Serve the app over HTTPS/localhost."
    );
  }

  private key(controller: string, network: "mainnet" | "testnet"): string {
    return `${network}:${controller}`;
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(
        IndexedDbIssuerIdentityStorage.DB_NAME,
        IndexedDbIssuerIdentityStorage.DB_VERSION
      );
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IndexedDbIssuerIdentityStorage.STORE_NAME)) {
          db.createObjectStore(IndexedDbIssuerIdentityStorage.STORE_NAME);
        }
        if (!db.objectStoreNames.contains(IndexedDbIssuerIdentityStorage.KEY_STORE_NAME)) {
          db.createObjectStore(IndexedDbIssuerIdentityStorage.KEY_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}

/** Detect whether the current runtime exposes a functional IndexedDB. */
export function isIndexedDbAvailable(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as { indexedDB?: unknown }).indexedDB !== "undefined"
  );
}

let warnedInMemoryNode = false;

/**
 * Pick the best default storage for the current runtime. Browsers get
 * IndexedDB (with the assertion key encrypted at rest); everything else falls
 * back to an in-memory map.
 *
 * IMPORTANT (server-side): the in-memory fallback does NOT persist across
 * process restarts, so a Node integrator that relies on it will mint a BRAND
 * NEW `did:stellar` (and trigger a fresh on-chain registration) on every
 * restart. Server-side issuers MUST provide a persistent
 * {@link IssuerIdentityStorage} (KMS, database, encrypted file).
 */
export function autoSelectStorage(): IssuerIdentityStorage {
  if (isIndexedDbAvailable()) {
    return new IndexedDbIssuerIdentityStorage();
  }
  if (!warnedInMemoryNode && typeof process !== "undefined" && process.versions?.node) {
    warnedInMemoryNode = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[acta] Using in-memory issuer-identity storage. It is NOT persisted across " +
        "restarts, so a new did:stellar will be created (and re-registered on-chain) " +
        "each time the process restarts. Provide a persistent IssuerIdentityStorage " +
        "for server-side use."
    );
  }
  return new InMemoryIssuerIdentityStorage();
}
