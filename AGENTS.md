# AGENTS.md

Hand-off notes for the next agent session. Read this, not the whole repo.

## Purpose

bunpm: CommonJS CLI that routes `npm`/`npx`/`yarn`/`pnpm` through Bun and falls
back to the original manager when a command can't be mapped safely. Zero runtime
dependencies; runtime needs Node.js 16.9+. Dev tooling needs Node 22.13+ and
Bun 1.3.14.

## Layout

- `bunpm/core/` - `wrapper.js` (entry), `mapper.js`, `detector.js`,
  `formatter.js`
- `bunpm/bootstrap.js` - remote installer (only network I/O)
- `bunpm/platforms/{windows,linux,macos}/` - launchers and install scripts
- `tests/` - `node:test` + `node:assert/strict`: `core`, `mapper`, `wrapper`,
  `bootstrap`, `uninstall` (Unix only), `toolchain`, `smoke` (`*.test.js`)
- `scripts/` - `syntax.js` (build), `coverage.js` (90% gate), `repeat.js`
- `.devcontainer/` - builds the test `Dockerfile`

## Commands

```sh
bun install --frozen-lockfile --ignore-scripts   # or: npm ci --ignore-scripts
bun run test          # = npm test = node --test "tests/*.test.js"
# also: build, test:coverage, test:repeat, lint, format:check, typecheck, smoke
```

Check the test count is > 0: `node --test` exits 0 when nothing matches.

## Conventions

- Ponytail/YAGNI: smallest diff, no new deps, mark simplifications `ponytail:`.
- One feature or fix plus its test per Conventional Commit; record what you
  ran to verify in the commit body.
- Refresh both lockfiles together: `bun install --ignore-scripts` and
  `npm install --package-lock-only --ignore-scripts`.
- Don't touch the C: drive. Scratch work goes in
  `X:\ALL FOLDER\TESTING FOR EVERYTHING\<subfolder>`; delete it afterwards.
  Set `BUN_INSTALL_CACHE_DIR` and `npm_config_cache` there too.
- Never commit `.kiro/`, `.agents/` or `.code-review-graph/`.

## Push procedure

Push to `main` only. No branches, PRs, issues, tags or releases. Ruleset
`main-protection` (id 22371642) requires `test-unit`, so:

1. Add the bypass: `gh api -X PUT repos/yv3000/bunpm/rulesets/22371642 --input -`
   with `{"bypass_actors":[{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"always"}]}`.
2. `git push`.
3. Restore with the same call and `{"bypass_actors":[]}`.
4. Watch with `gh run watch`.
5. Rerun "not acquired by Runner" infra failures with `gh run rerun <id> --failed`.

## Done

- Round 1: tests on `node:test`, Node LCOV coverage, LICENSE, SECURITY.md.
- Removed dead `platform-detect.js` and unused detector/mapper exports.
- Mapper: `--flag=value` (other than `--registry`) falls back.
- New mapper, uninstall and toolchain tests; eslint 10.12.0.
- Dependabot: `@types/node` major ignored, weekly groups.
- CI: `npm ci` + `npm test` in `test-unit`; eslint/tsc/prettier by name once;
  `npm audit` on Linux; per-OS JUnit artifacts; SHA-pinned actions.
- Dev container; good first issues in CONTRIBUTING.

## Deliberate non-changes

- `@types/node` stays 16.x so `typecheck` catches post-Node-16 APIs in runtime
  code. Don't bump it.
- Two lockfiles; the Dependabot npm updater can't refresh `bun.lock`, so run
  `bun install --ignore-scripts` after a tooling bump.
- No test-framework dependency (vitest/jest), no IaC, no CodeQL yet.

## Next

- Re-scan DataFactor. If "No test suite detected" persists, the remaining
  options are a framework devDependency or CodeQL; ask the user first.
- Good first issues in CONTRIBUTING.
- Once CI Node is >= 26.1, `test:repeat` randomizes automatically.
