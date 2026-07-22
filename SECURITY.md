# Security Policy

This repository publishes **`@acta-team/credentials`**, the React/TypeScript
SDK integrators install to issue and verify credentials through ACTA. A
vulnerability here ships to every application that depends on it, so we treat
supply-chain integrity as the primary concern.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.1.x | :white_check_mark: |
| 1.0.x | :x: |
| < 1.0 | :x: |

Only the latest `1.1.x` release is supported. We patch forward — if you are on
an older `1.1.x`, upgrade to the newest patch to receive a fix. When `2.0.0`
ships, `1.1.x` will receive security fixes for 90 days after that release.

## Scope

**In scope**

- The SDK sending an API key, secret, or credential payload anywhere other
  than the configured ACTA API host
- Signing helpers producing or transmitting a private key
- The SDK returning "verified" for a credential that is revoked, expired, or
  not actually valid
- Prototype pollution, injection, or unsafe deserialization in SDK code paths
- A published tarball containing files not present in this repository, or a
  version on npm we did not publish
- A vulnerable transitive dependency reachable from published SDK code
- Insecure defaults — anything where following the documented quickstart
  leaves an integrator exposed

**Out of scope**

- Vulnerabilities in the ACTA API itself — report those to
  **acta.xyz@gmail.com**, they are handled under the `acta-api` policy
- Advisories in `devDependencies` with no path into the published bundle.
  Tell us anyway, but they are not treated as SDK vulnerabilities
- Misuse by an integrating application, such as embedding an API key in
  client-side code shipped to end users. See the note below
- Vulnerabilities in the Soroban contracts — report those against
  [contracts-acta](https://github.com/ACTA-Team/contracts-acta)

**Note on API keys:** an ACTA API key is a server-side secret. The SDK cannot
protect a key an application chooses to ship to the browser. That is an
integration mistake rather than an SDK vulnerability — but if you find our
own documentation or examples encouraging it, that *is* in scope and we want
to know.

## Reporting a Vulnerability

**Do not open a public issue for a security report.**

Use GitHub's private reporting:
[**Report a vulnerability**](https://github.com/ACTA-Team/acta-credentials/security/advisories/new)

If you cannot use that form, email **acta.xyz@gmail.com** with `SECURITY` in
the subject.

Please include:

- The SDK version, and your framework and runtime (React version, Next.js,
  Node, bundler)
- A minimal reproduction — a code snippet is usually enough
- What an attacker gains
- Whether the issue is reachable from published code or only from the repo

### What happens next

| Stage | Timeline |
| ----- | -------- |
| We acknowledge your report | Within **3 business days** |
| We confirm or reject it, with reasoning | Within **10 business days** |
| Patch published to npm for a confirmed critical or high | Target **14 days** from confirmation |
| Patch published for moderate or low | Target **90 days** from confirmation |

You will get an update at each stage, and at least once every two weeks while
a report stays open.

**If we accept the report:** we fix it in a private advisory, publish a patch
release to npm, and open a GitHub Security Advisory so `npm audit` picks it up
for every integrator. You are credited by whatever name or handle you choose,
or anonymously.

**If we decline it:** we say why in writing. Disagree freely — we will
re-examine.

### Disclosure

We ask for **90 days**, or until a patched version is on npm, whichever comes
first. Because the fix reaches users only when they upgrade, we publish the
advisory alongside the release rather than before it.

If we go quiet or miss the timelines above, disclose. We will not object.

## Supply-chain expectations

If you believe the **npm package** has been tampered with — a version you
cannot match to a commit here, unexpected install scripts, or a maintainer
change you did not expect — report it immediately and treat it as critical.
Legitimate releases are cut from this repository and contain only `dist/`,
`README.md`, `CHANGELOG.md` and `LICENSE`.

The SDK is MIT-licensed and permissive by design: a fork is expected and fine.
A fork published under a name suggesting it is ours is not — see the
trademark note in the license.
