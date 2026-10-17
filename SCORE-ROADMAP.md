# DataFactor recovery roadmap

Updated: 2026-10-17. Planning baseline: `09fc5ec` (v2.3.2).

This document is a handoff for the requested 88+ recovery work. It records
evidence and acceptance criteria; it does not claim a future score.

## Execution checkpoint

- Gates 0-4 delivered: baseline, cohesive test modularization, explicit logger,
  frozen levels, direct pattern declaration, URL type guards, CI cache and names.
- Gate 6 delivered as real fixes: issue #24 / PR #26 (URL coercion) and issue
  #25 / PR #27 (freshness failures). Same-owner authorship/review is disclosed.
- 88 tests in 17 suites; Windows 83 pass, 5 Unix skips, zero failures. Coverage
  100% statements/lines/functions, 96.16% branches. Both audits are clean.
- Both PRs passed all three native OS jobs before merge. PR #27 evidence:
  https://github.com/yv3000/bunpm/actions/runs/39006763549.
- All authored files are below 265 lines. No runtime dependency or test framework
  was added. Both lockfiles were synchronized without content changes.
- Gate 5: native-test evidence is in tests/README.md and CI artifacts. The actual
  scanner remains proprietary; rescan follows final fresh-clone verification.
- The existing external commit 1633ef9 (`/4`) was preserved without rewriting.

## Guardrails

- Keep zero runtime dependencies and Node 16 API compatibility.
- Keep every authored file strictly below 275 lines; generated lockfiles are
  exempt by the user's explicit Oct 17 clarification. Current audit found
  formatter tests at 276 lines and three other test files at 265-271 lines.
- Do not add Docker, containers, IaC, services, telemetry, or a test framework
  merely to influence scanner output.
- Keep each behavior fix and its regression test in one conventional commit.
- Use X: only for temporary fixtures/caches, clean them after verification, and
  never commit generated output, credentials, or local paths.
- `yv3000` remains the maintainer identity. A trulyimmortal PR is permitted for
  a real independently reviewable change, but both accounts have the same human
  owner and that must remain disclosed. It cannot be represented as independent
  review or artificial contributor diversity.

## Report interpretation

The supplied score says 79/B: Architecture 70, Security 80, CI 85, and a Buyer
Fit failure because no test suite was detected. The repository already has
native `node:test`, c8 gates, 13 named suites, a structured logger object,
validation schemas, test metadata, and three-OS CI. This indicates scanner
detection gaps as well as genuine things to improve.

Known implementation facts at this baseline:

| Claim from report            | Verified repository state                                                                                | Planned response                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Logger is ad-hoc             | `logger.error/warn/info/debug` exists, but wrapper aliases `log` as `diagnose`; no `LOG_LEVELS` constant | Make logger use explicit and machine-readable without changing output behavior.                               |
| Validation patterns empty    | both exported names already exist and runtime guards use them                                            | Inspect static shape; add only a non-duplicative declaration or JSDoc that makes current guards discoverable. |
| CI lacks test/lint/typecheck | commands run in CI, but generic step names may not match scanner rules                                   | Add scanner-readable names while retaining actual commands and quoted YAML trigger.                           |
| No suite                     | `node:test` is deliberately native, and `testConfig.framework` says so                                   | First reproduce or obtain scanner evidence. Do not add Mocha/Vitest speculatively.                            |

## Delivery sequence

### Gate 0 — establish a truthful baseline

- Record `git status`, tracked lockfiles, line counts, current Node/Bun versions,
  package metadata, CI workflow, and the supplied report date.
- Run the complete local quality sequence through direct Node commands so the
  stale global bunpm cannot intercept npm. Record actual counts and coverage.
- Verify the latest GitHub run before modifying workflow semantics.
- Do not rescan DataFactor until the planned commits and CI finish.

### Gate 1 — restore the strict size invariant

- Separate line/stream formatting, bootstrap transport/contracts and native
  installer profiles, and extract mapper assertion helpers. Keep all authored
  files below 265 lines without lowering assertions or coverage.
- Test behavior and run the file-count audit in the same commit.
- This is hygiene only; it must not be presented as a functional score lever.

### Gate 2 — architecture and structured diagnostics

- Add `LOG_LEVELS = Object.freeze(['error', 'warn', 'info', 'debug'])` to
  `bunpm/core/log.js`, export it, and test its exact frozen contents.
- Add the requested `@logging_framework bunpm-diagnostic-logger` documentation
  only if it accurately describes the current logger API.
- Replace wrapper's `{ log: diagnose }` import and calls with explicit
  `logger.error(...)` calls. Preserve existing human stderr, debug JSON schema,
  exit codes, fallback behavior, and error codes.
- Keep both files below the line limit; extract no production module solely for
  line-count cosmetics. Extend `tests/log.test.js` and wrapper diagnostics tests.
- Acceptance: exact diagnostics remain compatible, each level is covered,
  syntax/lint/typecheck/format/tests/coverage pass.

### Gate 3 — validation discoverability without duplicate policy

- Inspect `validate.js` against the actual static scanner output if obtainable.
- Keep `input_validation_patterns` as a top-level identifier and exported value.
  Its current alias to the frozen canonical pattern table is intentional.
- Add `@security-guard trust-boundary` annotations to exported validators only
  if the scanner is known to read them. Do not add a second `VALIDATION_SCHEMAS`
  table that can drift from runtime guards.
- Prove malformed values still throw `TypeError`; keep coverage at current gates.

### Gate 4 — CI signal clarity and dependency health

- Add `cache: npm` to every Node setup step only after confirming it works with
  both npm-lock installation and the Bun quality matrix. This is a performance
  improvement, not a test result substitute.
- Rename existing CI steps to contain literal scanner-recognizable commands:
  `Run test suite (npm test)`, `Run linter (npm run lint)`, and
  `Run typecheck (npm run typecheck)`. Keep commands themselves unchanged.
- Preserve quoted `'on'`, non-null `pull_request.branches`, pinned action SHAs,
  audit behavior, three-OS matrix, c8 hard gate, lockfile checks, and freshness
  failure distinction.
- Validate actionlint, PyYAML parsing, and the full pipeline. Check that cache
  keys use the tracked `package-lock.json`.

### Gate 5 — resolve the native-test detection issue honestly

- Prefer an evidence pack: package `test` script, `node:test` imports,
  named `describe` suites, c8 config, `tests/README.md`, JUnit artifact, and a
  passing CI URL.
- The user confirmed the scanner is proprietary and unavailable locally. Its
  exact recognition rules cannot be inferred from the supplied report alone.
- If DataFactor evidence proves its framework list
  cannot recognize native `node:test`, document the false negative with its
  exact evidence for support/rescan rather than adding Mocha.
- Do not add Mocha: prior repository evidence found high-severity Mocha
  advisories, and this project's current tests rely on Node's native mock API.
  A framework migration is allowed only after an actual rescan still reports no
  suite and after audit/compatibility evidence supports a safe proposal.
  Sharing Mocha-style test names does not make Node test imports, mock APIs,
  hooks or process isolation interchangeable with Mocha.

### Gate 6 — genuine maintenance work

- Select one small user-facing bug or compatibility improvement with a real
  regression test. If suitable, open an honest issue and submit it as
  `trulyimmortal`; disclose same-owner status and let yv3000 review behavior.
- Do not manufacture issues, reviews, or commits to alter author statistics.
- Maintain conventional commit bodies with tests run; do not split one logical
  change into cosmetic microcommits.

## Commit and verification rules

One gate may produce one or more atomic commits only where each contains a
complete behavior change and regression test. Before each commit run the
relevant subset; before push run:

```sh
npm run build
npm test
npm run test:coverage
npm run lint
npm run typecheck
npm run format:check
npm audit
bun audit
```

Also run the strict line-count audit, `git diff --check`, native smoke tests,
repeat tests, and actionlint/ShellCheck for workflow or shell edits. Refresh
both lockfiles together only when dependencies change.

Push only after local checks pass. Use the documented temporary ruleset bypass
and restore the empty bypass actor list even if pushing fails. Watch the actual
GitHub workflow to completion. Create no release or tag unless separately due
and requested.

## Completion criteria

Work is complete when all intended gates are committed, local checks and GitHub
CI pass, authored files are below 275 lines, zero runtime dependencies remain, and
the follow-up DataFactor scan is saved alongside a factual comparison. If the
scanner still misses native tests, report that as an evidenced limitation rather
than masking it with unsafe dependencies or infrastructure.
