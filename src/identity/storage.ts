/**
 * Default storage implementations for issuer identities.
 *
 * - `InMemoryIssuerIdentityStorage` — process-local map. Default in Node
 *   environments and as a fallback when no other backend is configured.
 * - `IndexedDbIssuerIdentityStorage` — browser-only, persists across
 *   tabs and reloads. Used automatically when `indexedDB` is available.
 *
 * Integrators with custom requirements (KMS, encrypted file, hardware
 * wallet) implement {@link IssuerIdentityStorage} themselves and pass it
 * to the client.
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

/**
 * Browser-only storage backed by IndexedDB. Falls back to throwing on
 * unsupported runtimes — callers MUST check {@link isIndexedDbAvailable}
 * first or use {@link autoSelectStorage}.
 */
export class IndexedDbIssuerIdentityStorage implements IssuerIdentityStorage {
  private static readonly DB_NAME = "acta-issuer-identity";
  private static readonly STORE_NAME = "identities";
  private static readonly DB_VERSION = 1;

  async get(
    controller: string,
    network: "mainnet" | "testnet"
  ): Promise<IssuerIdentity | null> {
    const db = await this.openDb();
    try {
      return await new Promise<IssuerIdentity | null>((resolve, reject) => {
        const tx = db.transaction(IndexedDbIssuerIdentityStorage.STORE_NAME, "readonly");
        const store = tx.objectStore(IndexedDbIssuerIdentityStorage.STORE_NAME);
        const req = store.get(this.key(controller, network));
        req.onsuccess = () => resolve((req.result as IssuerIdentity | undefined) ?? null);
        req.onerror = () => reject(req.error);
      });
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
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IndexedDbIssuerIdentityStorage.STORE_NAME, "readwrite");
        const store = tx.objectStore(IndexedDbIssuerIdentityStorage.STORE_NAME);
        const req = store.put(identity, this.key(identity.controller, network));
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
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
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}

/** Detect whether the current runtime exposes a functional IndexedDB. */
export function isIndexedDbAvailable(): boolean {
  return typeof globalThis !== "undefined" && typeof (globalThis as { indexedDB?: unknown }).indexedDB !== "undefined";
}

/**
 * Pick the best default storage for the current runtime. Browsers get
 * IndexedDB; everything else falls back to an in-memory map.
 */
export function autoSelectStorage(): IssuerIdentityStorage {
  if (isIndexedDbAvailable()) {
    return new IndexedDbIssuerIdentityStorage();
  }
  return new InMemoryIssuerIdentityStorage();
}
