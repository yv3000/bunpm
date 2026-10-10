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
code, noisy by 10-25 points. Scans: 59, 64, 50, 54 -> 81 (B, latest).

Root cause of earlier low scores was infra misclassification; latest scan classified
as "Backend". Levers in order:

1. Classification: keep CLI banner/keywords; root `bin/` file if still needed.
2. Machine-detectable tooling: c8 gates + validation test suite + structured logger.
3. Mineable history: one real fix or feature plus its test per commit.
4. Never: fake IaC, cosmetic churn, commits without tests.

| Dim (last scan)     | Score | Evidence / Lever                    |
| ------------------- | ----- | ----------------------------------- |
| D Architecture      | 78    | log.js structured JSON diagnostic   |
| B Test Coverage     | 82    | c8 blocking gate, 90% branches      |
| C Cleanliness       | 88    | all files < 300 LOC, strict lint    |
| F Docs & Onboarding | 85    | Quickstart + branch-protection docs |
| I Security Hygiene  | 80    | tests/validation.test.js boundary   |
| E Deps Health       | 78    | zero runtime deps, locked pins      |
| H CI/CD             | 85    | 3-OS matrix, coverage gate pinned   |
| K History & Maint   | 70    | 1 author; real commits over time    |

## Deliberate non-changes

- `@types/node` stays 16.x so `typecheck` catches post-Node-16 APIs.
- No IaC, no CodeQL. The local `~/.bunpm` install on this machine is stale and
  intercepts `npm`; use `node <node dir>/node_modules/npm/bin/npm-cli.js`.

## Round 6 (Oct 10)

Structured JSON logger `core/log.js` (`BUNPM_DEBUG=1`) + bootstrap parity;
dedicated `tests/validation.test.js` boundary suite; blocking c8 coverage gate
(`continue-on-error: false`) in CI; documented `main-protection` ruleset + PR
checklist in CONTRIBUTING.md; fresh-clone quickstart + CLI banner in README.md.

## Next

- Re-scan on DataFactor; update scores. If still "Backend", test root `bin/bunpm`.
- If "No test suite detected" persists, migrate to vitest (user approved).
- Next real fixes: Yarn Berry PnP (.pnp.cjs check), Unix profile blank line fix.
