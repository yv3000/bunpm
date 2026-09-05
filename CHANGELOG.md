# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `core/errors.js`: `BunpmError` with machine-readable codes (`BUN_NOT_FOUND`,
  `UNSUPPORTED_COMMAND`, `UNSUPPORTED_PLATFORM`, `SPAWN_ERROR`, `INVALID_INVOCATION`).
  Failures now print `CODE: message`, so tools wrapping bunpm can branch on the code
  instead of pattern-matching prose.
- Input validation at the `wrapper.js` entry point. `argv[2]` must be one of
  `npm`/`npx`/`yarn`/`pnpm`, and a mapping with neither `bunArgs` nor `fallbackTo` now
  falls back to the original binary instead of spawning bun with undefined arguments.
- Unit test suite under `bunpm/core/` for `mapper.js`, `formatter.js`,
  `platform-detect.js`, `errors.js`, the wrapper entry point, and the bootstrap download
  manifest. Run with `bun test bunpm/core/`.
- Repo-root `package.json` and committed `bun.lock` pinning the dev tooling, so a fresh
  clone installs reproducibly with `bun install --frozen-lockfile`. The shipped
  `bunpm/package.json` still declares zero dependencies.
- eslint (`bunpm/.eslintrc.json`) and prettier (`bunpm/.prettierrc`) configuration, plus
  `lint`, `format` and `check-syntax` scripts.
- CI `test-unit` job running syntax checks, unit tests and lint on every push. The three
  live-install jobs now depend on it, so logic errors fail in seconds rather than after
  three full network installs.
- `CONTRIBUTING.md` and this changelog.

### Fixed

- `bootstrap.js` did not download `core/errors.js`, which would have produced installs
  that failed with `MODULE_NOT_FOUND` on first use. `core/download-manifest.test.js` now
  derives the require graph from source and fails if the download list drifts again.
- `consistent-return` violation in `bootstrap.js`'s redirect handling: the redirect and
  non-200 branches returned values that `https.get` discards, while the success branch
  fell through.

## [2.0.4] - 2025-07-26

### Added

- Cross-platform support. Windows, macOS and Linux each get their own installer and
  launchers under `platforms/`, while `core/` stays OS-agnostic.
- `yarn` interception, covering both Yarn Classic and the common Yarn Berry subset
  (`add`, `remove`, `dlx`, `exec`, `global add`, `why`, `upgrade`), with yarn-style
  output including `success Saved N new dependencies.`
- `pnpm` interception (`add`, `install`, `remove`, `dlx`, `why`, ...) with pnpm-style
  `Packages: +N` output.
- `core/platform-detect.js` as the single source of truth for OS detection and install
  paths.
- `bootstrap.js` downloads only the files for the detected platform — a Linux install
  never fetches Windows files.
- Automatic fallback to real pnpm for any workspace-scoped command (`-r`,
  `--recursive`, `--filter`), because bun's filter semantics are not guaranteed to match
  pnpm's and a wrong translation could target the wrong packages.

### Fixed

- `npm run dev` no longer appears to hang. Long-running and interactive subcommands
  (`run`, `test`, `start`, `stop`, `restart`) inherit stdio instead of being piped
  through the formatter, so dev servers stream live.
- Output encoding on Windows consoles.
- `npx`, `yarn dlx` and `pnpm dlx` share a single bunx code path, so interactive
  scaffolding prompts work identically for all three.

## [2.0.0] - 2025-07-26

### Changed

- **Breaking:** repository restructured from `bunpm/lib/` to `bunpm/core/` plus
  `bunpm/platforms/<os>/`, and the installer now stages into `~/.bunpm/` on every OS.
  v1.x installs should be uninstalled before installing v2.

## [1.2.2] - 2025-06-19

### Fixed

- The installer did not copy the `scripts/` folder into the install directory, leaving
  users with no way to uninstall.

## [1.1.0] - 2025-06-19

### Fixed

- `npx` ran with piped stdio, which swallowed interactive prompts and made scaffolding
  tools such as `create-vite` unusable. It now inherits the terminal.

## [1.0.0] - 2025-06-08

### Added

- Initial Windows-only release: `npm` and `npx` launchers, `lib/wrapper.js`,
  `lib/mapper.js`, `lib/formatter.js`, `lib/detector.js`, and a PowerShell
  install/uninstall pair driven by a PATH prepend.

[Unreleased]: https://github.com/yv3000/bunpm/compare/v2.0.4...HEAD
[2.0.4]: https://github.com/yv3000/bunpm/compare/v2.0.0...v2.0.4
[2.0.0]: https://github.com/yv3000/bunpm/compare/v1.2.2...v2.0.0
[1.2.2]: https://github.com/yv3000/bunpm/compare/v1.1.0...v1.2.2
[1.1.0]: https://github.com/yv3000/bunpm/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/yv3000/bunpm/releases/tag/v1.0.0
