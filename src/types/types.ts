/**
 * Base API URL type for ACTA services.
 */
export type baseURL =
  | "https://api.mainnet.acta.build"
  | "https://api.testnet.acta.build";

export interface ActaConfigProps {
  baseURL: baseURL;
  children: any;
  apiKey?: string;
}
