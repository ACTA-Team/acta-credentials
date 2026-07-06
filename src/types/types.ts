import type { ReactNode } from "react";

/**
 * Base API URL for ACTA services.
 *
 * The two production URLs are suggested by autocomplete, but any string is
 * accepted so integrators can point at staging, a self-hosted API, or
 * `http://localhost:...` during development. The `mainNet` / `testNet`
 * constants are exported for convenience.
 */
export type baseURL =
  | "https://api.mainnet.acta.build"
  | "https://api.testnet.acta.build"
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

export interface ActaConfigProps {
  baseURL: baseURL;
  children: ReactNode;
  apiKey?: string;
}
