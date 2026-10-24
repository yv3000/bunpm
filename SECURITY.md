# Security Policy

Only the latest commit on `main` is supported; there are no maintained release
branches.

## Vulnerability Reporting

Report a vulnerability privately through GitHub's
[private advisory form](https://github.com/yv3000/bunpm/security/advisories/new)
or by emailing the maintainer directly at `191557828+yv3000@users.noreply.github.com`.
Do not open a public issue for an unpatched vulnerability. Include the bunpm
commit SHA, OS platform, Node.js and Bun versions, and minimal reproduction steps.

## Single-Maintainer Context

bunpm is a focused utility maintained by an individual developer. If the primary
maintainer becomes unavailable, security disclosures and triage follow the
governance and continuity procedure recorded in [MAINTAINERS.md](MAINTAINERS.md).

## Trust Boundaries & Threat Model

bunpm operates with zero runtime dependencies. Its security boundaries enforce
defense-in-depth across three execution vectors:

### 1. Remote Bootstrap (`bunpm/bootstrap.js`)

When users invoke the remote bootstrap script without a local checkout:

- **HTTPS-Only Transport**: Download requests reject non-HTTPS URLs at the trust
  boundary (`TypeError`).
- **Commit SHA Pinning**: Remote downloads require a strict 40-character commit
  SHA (`--revision <sha>`). URLs must match `https://raw.githubusercontent.com/yv3000/bunpm/<sha>/bunpm/*`.
- **Redirect Limits**: HTTP redirects are permitted only within the same repository
  and same revision, bounded strictly to a maximum of 5 hops to prevent loop exhaustion.
- **Resource Limits**: Every downloaded runtime file is bounded to 15 seconds
  and a maximum size of 1 MiB. Partial or truncated streams are destroyed and cleaned up.
- **Integrity Notice**: Revision matching ensures transport integrity and strict
  content pinning; it is **not** a cryptographic author signature. Users should
  review code before executing bootstrap in sensitive environments.

### 2. Trust-Boundary Validation & Schema Assertions (`bunpm/core/validate.js` & `bunpm/core/schema.js`)

- **Argument Sanitization**: `validateArgs` and `assertCliArgs` ensure all arguments are string arrays
  without embedded NUL bytes (`\0`), preventing process spawn truncation and command
  injection attacks.
- **Manager Validation**: `validateManager` rejects any invocation name not in
  the supported manager set (`npm`, `npx`, `yarn`, `pnpm`).
- **Executable Binary Validation**: `validateBinary` enforces absolute paths or
  safe alphanumeric binary basenames, rejecting relative traversal (`../`).
- **Environment & URL Boundaries**: `assertSafeEnv` guards against poisoned environment keys or
  NUL bytes, while `validateUrl` and `assertHttpsUrl` restrict remote download endpoints to pinned HTTPS.

### 3. Native Child Process Execution (`bunpm/core/wrapper.js`)

- On Windows, batch script arguments routed to native `.cmd` shims avoid shell
  concatenation vulnerabilities, preventing metacharacter execution.
- Child process exit codes and signals are passed through without alteration.
