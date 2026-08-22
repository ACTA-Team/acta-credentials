/**
 * Which Stellar network a base URL points at.
 *
 * The network drives real decisions inside the client: which DID registry the
 * issuer identity provider talks to, which `ACTA_API_KEY_*` variable is read,
 * and whether sponsored DID registration is offered at all. Getting it wrong is
 * silent, which is what makes it dangerous.
 *
 * It is inferred from the host because the constructor has never taken it as an
 * argument. That inference used to be a single `includes("mainnet")`, which
 * broke the moment the hosts were renamed to `production-api` / `sandbox-api`:
 * a mainnet client quietly became a testnet one. Both the current and the
 * legacy names are recognised here so integrators pinned to either keep
 * working.
 *
 * Anything unrecognised resolves to testnet on purpose. A staging box, a
 * self-hosted deployment or `http://localhost` should not be assumed to be
 * mainnet, and the failure mode of guessing testnet is a rejected request
 * rather than a credential issued against the wrong chain.
 */
const MAINNET_MARKERS = ["mainnet", "production"];

export function networkFromBaseUrl(baseUrl: string): "mainnet" | "testnet" {
  const host = String(baseUrl ?? "").toLowerCase();
  return MAINNET_MARKERS.some((marker) => host.includes(marker))
    ? "mainnet"
    : "testnet";
}
