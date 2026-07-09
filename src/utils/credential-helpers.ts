/**
 * Helper functions for credential operations.
 */

/**
 * `did:stellar` v0.1 identifier format.
 * `did:stellar:{network}:{didId}` where `didId` is 16 random bytes encoded as
 * lowercase base32 (exactly 26 chars). See the did:stellar method spec.
 */
export const DID_STELLAR_REGEX =
  /^did:stellar:(mainnet|testnet):[a-z2-7]{26}$/;

/** Returns true if `value` is a syntactically valid `did:stellar`. */
export function isValidDidStellar(value: string): boolean {
  return DID_STELLAR_REGEX.test(value);
}

/** Network embedded in a `did:stellar`, or `null` if the DID is invalid. */
export function didStellarNetwork(
  value: string
): "mainnet" | "testnet" | null {
  const match = DID_STELLAR_REGEX.exec(value);
  return match ? (match[1] as "mainnet" | "testnet") : null;
}

/**
 * Validate an issuer DID.
 *
 * The issuer DID must be a valid, on-chain-registered `did:stellar` for the
 * active network. Wallet addresses and the legacy `did:pkh` scheme are no
 * longer accepted: a credential cannot be issued unless its issuer DID
 * resolves, so the issuer must register a `did:stellar` first.
 *
 * @param did - The issuer DID (must be a `did:stellar`).
 * @param network - Active network; the DID's network must match.
 * @returns The validated DID, unchanged.
 * @throws If the DID is missing, malformed, or on a different network.
 */
export function normalizeDid(
  did: string,
  network: "mainnet" | "testnet"
): string {
  const value = (did ?? "").trim();

  if (!isValidDidStellar(value)) {
    throw new Error(
      `issuerDid must be a valid did:stellar (e.g. "did:stellar:${network}:<26-char-id>"). ` +
        `Wallet addresses and did:pkh are no longer accepted - register a did:stellar first. ` +
        `Got: "${did}"`
    );
  }

  const didNetwork = didStellarNetwork(value);
  if (didNetwork !== network) {
    throw new Error(
      `issuerDid network "${didNetwork}" does not match the client network "${network}".`
    );
  }

  return value;
}

/**
 * Ensure vcData includes @context field.
 * If vcData is a string (JSON), parses it and adds @context if missing.
 * If vcData is an object, adds @context if missing.
 * @param vcData - Credential data as JSON string or object
 * @returns JSON string with @context included
 */
export function ensureContextInVcData(
  vcData: string | Record<string, unknown>
): string {
  const requiredContext = [
    "https://www.w3.org/ns/credentials/v2",
    "https://www.w3.org/ns/credentials/examples/v2",
  ];

  let data: Record<string, unknown>;
  
  if (typeof vcData === "string") {
    try {
      data = JSON.parse(vcData);
    } catch (e) {
      throw new Error(
        `Invalid JSON in vcData: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  } else {
    data = { ...vcData };
  }

  // Add @context if not present or not properly formatted
  if (!data["@context"] || !Array.isArray(data["@context"])) {
    data["@context"] = requiredContext;
  } else {
    // Ensure required context URLs are present
    const existingContext = data["@context"] as string[];
    const missingContext = requiredContext.filter(
      (url) => !existingContext.includes(url)
    );
    if (missingContext.length > 0) {
      data["@context"] = [...existingContext, ...missingContext];
    }
  }

  return JSON.stringify(data);
}
