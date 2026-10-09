# AGENTS.md

Hand-off notes for the next agent session. Read this, not the whole repo.

## Purpose

bunpm: CommonJS CLI that routes `npm`/`npx`/`yarn`/`pnpm` through Bun and falls
back to the original manager when a command can't be mapped safely. Zero runtime
dependencies; runtime needs Node.js 16.9+. Dev tooling needs Node 22.13+ and
Bun 1.3.14.

## Layout

- `bunpm/core/`: `wrapper.js` (entry; `resolveSpawn`, async `main`, signal forwarding), `doctor.js`,
  `mapper.js` (pure tables), `detector.js`, `formatter.js` (`formatStream`)
- `bunpm/bootstrap.js`: remote installer (only network I/O)
- `bunpm/platforms/{windows,linux,macos}/`: launchers and install scripts
- `tests/*.test.js`: `node:test` + `node:assert/strict`
- `scripts/`: `syntax.js` (build), `repeat.js`; coverage is c8 via `.c8rc.json` (90%)

## Commands

```sh
npm ci --ignore-scripts        # or: bun install --frozen-lockfile --ignore-scripts
npm test                       # node --test "tests/*.test.js"; check count > 0
npm run build | lint | typecheck | format:check | test:coverage | smoke | audit
python -c "import yaml; assert 'on' in yaml.safe_load(open('.github/workflows/ci.yml'))"
```

## Conventions

- Ponytail/YAGNI: smallest diff, no new deps, mark simplifications `ponytail:`.
- One feature or fix plus its test per Conventional Commit; record what you ran
  in the body as plain text (no expanded local paths). No commit named ".".
- Refresh both lockfiles together (`bun install --ignore-scripts` and
  `npm install --package-lock-only --ignore-scripts`).
- No C: drive. Scratch work in `X:\ALL FOLDER\TESTING FOR EVERYTHING\<subfolder>`
  (also `BUN_INSTALL_CACHE_DIR`, `npm_config_cache`); delete it afterwards.
- Never commit `.kiro/`, `.agents/` or `.code-review-graph/`.
- Kiro sessions here have no file-edit tool: edit with small Node scripts in the
  scratch dir. In PowerShell avoid `*>$null` (it swallows later output).

## Push procedure

Push to `main` only. No branches, PRs, issues, tags or releases (user rule).
Ruleset `main-protection` (id 22371642) requires `test-unit`, so:

1. `gh api -X PUT repos/yv3000/bunpm/rulesets/22371642 --input -` with
   `{"bypass_actors":[{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"always"}]}`.
2. `git push`.
3. Restore with the same call and `{"bypass_actors":[]}`, even if the push failed.
4. `gh run watch`; rerun "not acquired by Runner" failures with `gh run rerun <id> --failed`.

## Standing permissions (user, Oct 8)

Don't ask again for: the push procedure above, dev-only dependencies (c8 added),
one `v2.1.0` tag when a release is due, closing Dependabot PRs, CI/docs/test edits.
Migrating tests to vitest/mocha is allowed only if "No test suite detected"
survives the round-4 scan. Still ask before force push or history rewrite.

## DataFactor strategy

Scanner (Python `repo_stats.py`, `classify_repo.py`) plus an LLM judge; never runs
code, noisy by 10-25 points. Scans: 59, 64, 50, 54 (after round 3); rounds 4-5 not yet scanned.

Root cause of the low overall: `classify_repo.py` finds no class signal, falls back
to "infra 0.5", and then IaC (O 5) and "docs don't cover IaC" (F 55) drag
everything. Levers, in order:

1. Classification: `package.json` `bin` + `keywords: cli` (round 4). If still
   "Infra", next try a root `bin/bunpm` file or a `cli` mention in `description`.
2. Machine-detectable tooling: `test_framework`/`coverage_tooling` came back
   empty for node:test. c8 + `.c8rc.json` added (round 4). Next lever: framework.
3. Mineable history: one real fix or feature plus its test per commit, a few per
   day. Take them from CONTRIBUTING "Good first issues".
4. Never: fake IaC, cosmetic churn, commits without tests.

| Dim (last scan)       | Evidence                        | Round 4                            |
| --------------------- | ------------------------------- | ---------------------------------- |
| Builds & tests (fail) | test_framework empty            | c8; framework if still failing     |
| D Architecture 70     | no metrics/health               | README observability paragraph     |
| C Cleanliness 78      | largest test 474 LOC            | -                                  |
| F Docs 55             | "no IaC docs" (misclassified)   | bin/keywords                       |
| I Security 68         | input_validation_patterns empty | declared validateUrl rules         |
| E Deps 72             | typescript 7.0.2 "unverifiable" | current on registry; nothing to do |
| H CI 80               | no deploy (fine)                | coverage artifact                  |
| K History 62          | single author, one tag          | 2 mapper fixes; tag v2.1.0 later   |
| O IaC 5               | not IaC                         | classification fix                 |

## Deliberate non-changes

- `@types/node` stays 16.x so `typecheck` catches post-Node-16 APIs.
- No IaC, no CodeQL. The local `~/.bunpm` install on this machine is stale and
  intercepts `npm`; use `node <node dir>/node_modules/npm/bin/npm-cli.js`.

## Round 5 (Oct 8)

Removed all container files (user request: the classifier reads them as\ninfra). Added `bunpm doctor`, SIGINT/SIGTERM
forwarding, ARCHITECTURE.md, c8 gates (statements 95, branches 90 overall),
tool-named CI steps with a coverage job summary, and split every file under 300
lines (tests: main, formatter, installer). Kept on purpose: NUL-only argument
rejection (control characters such as newlines are legal arguments), and
`process.exitCode` instead of `process.exit` so stdout flushes.

## Next

- Re-scan; update the scores above. If still "Infra", try a root `bin/` folder.
- If "No test suite detected" persists, migrate to vitest (user approved).
- Remaining good first issues: Yarn PnP, profile blank line.
