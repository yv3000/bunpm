# bunpm Test Suite

Native test runner and coverage configuration for bunpm.

## Runner & Architecture

- **Runner**: Node.js built-in `node:test` (`npm test` -> `node --test "tests/*.test.js"`).
- **Assertions**: Node.js built-in `node:assert/strict`.
- **Zero Test Dependencies**: Uses Node's standard library test runner directly; no runtime or external framework required.
- **Coverage**: [c8](https://github.com/bcoe/c8) configured via [`.c8rc.json`](../.c8rc.json) enforcing 95% statements, 90% branches, 90% functions, and 90% lines.
- **Type Checking**: TypeScript strict `checkJs` via [`jsconfig.json`](../jsconfig.json) against `@types/node` 16.

## Test Suites

1. `tests/core.test.js`: Core mapper units, flag translations, POSIX exit codes, and child pipe error handling.
2. `tests/mapper.test.js`: Command mapping tables, flags, aliases, and native fallbacks across npm, yarn, and pnpm.
3. `tests/wrapper.test.js`: Binary resolution, wrapper entry, execution routing, and error diagnostics.
4. `tests/main.test.js`: Streamed execution, signal forwarding (SIGINT/SIGTERM), and fallback lifecycle.
5. `tests/formatter.test.js`: Output line styling and manager-specific formats.
6. `tests/formatter-stream.test.js`: Bounded buffering, split UTF-8, and seeded chunking properties.
7. `tests/validation.test.js`: Trust-boundary input validation schemas and fail-closed security guards.
8. `tests/log.test.js`: Multi-level diagnostic logging and structured JSON schema (`BUNPM_DEBUG=1`).
9. `tests/doctor.test.js`: Diagnostic health checks (`bunpm doctor`) and environment validation.
10. `tests/bootstrap.test.js`: Standalone remote installer transport and redirect security.
11. `tests/bootstrap-contract.test.js`: Manifest, URL validation, and CLI entry contracts.
12. `tests/installer.test.js`: Windows PATH configuration, rollback ownership, and native prerequisite failures.
13. `tests/installer-unix.test.js`: Unix profile read-error rollback.
14. `tests/uninstall.test.js`: Shell profile marker removal and idempotent profile cleanup.
15. `tests/toolchain.test.js`: Node/Bun version pins, bin scripts, and CI workflow invariants.
16. `tests/smoke.test.js`: End-to-end native installation, execution, launcher, and uninstall lifecycle.
17. `tests/freshness.test.js`: Advisory dependency-report classification and CLI artifacts.

## Commands

```sh
npm test                      # Run every tests/*.test.js suite offline
npm run test:coverage         # Run test suites with c8 coverage enforcement
npm run test:repeat           # Run 3 consecutive test iterations (with random seeds on Node 26+)
npm run typecheck             # Validate strict types against jsconfig.json
npm run lint                  # Verify 0 ESLint warnings
npm run format:check          # Verify Prettier compliance
```
