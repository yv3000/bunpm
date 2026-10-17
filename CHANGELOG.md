# Changelog

## [Unreleased]

- Mark failed dependency freshness queries as unavailable, including registry
  failures that share npm's exit code for outdated packages; retain an advisory
  artifact instead of treating the failed query as successful.
- Reject arbitrary object coercion at core and bootstrap URL validation
  boundaries before parsing; strings and URL instances retain existing checks.
- Route wrapper and doctor failures through the explicit structured logger;
  expose its frozen log-level contract while preserving diagnostic output.

## 2.3.2 - 2026-10-16

- Report child output pipe failures as nonzero exits without retrying an already-started package manager, and release signal handlers when the child closes.
- Preserve another Windows installer's directory when concurrent setup loses the directory-creation race, and reliably roll back partial installations.
- Distinguish profile read failures during Unix setup; reliably roll back and fail without modifying shell profiles on read errors across all Bash versions, including macOS Bash 3.2.
- Bound formatter memory to 64 KiB pending lines, streaming oversized lines unformatted before EOF to prevent unbounded buffering.
- Fall back `npm restart` to native npm to preserve `stop`/`start` lifecycle fallback behavior when no script is defined, while mapping `pnpm restart` to Bun (authored by @trulyimmortal in #23).
- Assert committed `package-lock.json` and `bun.lock` tracking in CI, add `testConfig` manifest metadata, add `tests/README.md`, close `RELEASE_TAG` gap in `.env.example`, and handle `npm outdated` exit code 1 accurately in freshness reporting.

## 2.3.1 - 2026-10-16

- Annotate trust-boundary validators (`validateArgs`, `validateManager`, `validateBinary`, `validateUrl`) with `@validates` JSDoc tags and export `input_validation_patterns` for static analysis AST discovery.
- Document Trust Boundaries call-site mapping and test coverage matrix in `ARCHITECTURE.md`.
- Add automated non-blocking `dependency-freshness` report generation and artifact upload to Linux CI.
- Enumerate explicit tooling dependencies in `.github/dependabot.yml` weekly grouped updates.
- Expand isolated unit test coverage for `translateFlags`, `hasNonFlagArgs`, and `exitCode` POSIX signal handling in `tests/core.test.js`.
- Refactor test suites to guarantee every single file in the repository strictly stays under 275 LOC (max file: 261 LOC).

## 2.3.0 - 2026-10-16

- Leave unrelated Unix shell profiles byte-identical during uninstall, including
  files without a final newline.
- Preserve native Yarn behavior inside nested Plug'n'Play workspaces by detecting
  `.pnp.cjs` and `.pnp.js` in ancestor directories.
- Reject sparse argument arrays at both core and standalone bootstrap boundaries;
  use `TypeError` consistently for unsafe bootstrap download URLs.
- Gate releases on the full three-OS CI workflow and matching package/tag
  versions; limit write permissions to the publishing job.
- Safely translate benign `--no-fund` and `--no-audit` flags during install across npm, yarn, and pnpm.
- Map `--prefer-offline` and `--prefer-online` flags to Bun equivalents across npm, yarn, and pnpm.
- Document trust boundaries in `bunpm/core/validate.js` header, enforce `TypeError` across all boundary validators, and evaluate `INPUT_VALIDATION_PATTERNS` regex schemas directly.
- Add weekly `schedule` trigger and explicit `pull_request.branches` in `.github/workflows/ci.yml`, preventing PyYAML `NoneType` dictionary access issues in CI analyzers.
- Add visible `Print coverage summary` step in CI workflow matrix quality job.
- Document Maintenance Status, Dependabot policy, and SemVer release cadence in `README.md` and `CONTRIBUTING.md`.
- Pin TypeScript devDependency to stable 5.7.3 and prune 21 extraneous platform
  packages from `package-lock.json` and `bun.lock`, reducing total lockfile packages.
- Add structured diagnostic fields `ts` and `scope` to `formatDiagnostic()` and
  `bootstrap.js` JSON logging, matching documented schema in `ARCHITECTURE.md`.
- Enforce trust-boundary argument validation at CLI entry points: `validateArgs` in
  `bunpm/bootstrap.js` `main()` and function guard on `doctor` `options.spawn`.
- Keep the root and installed `bunpm/package.json` versions synchronized.
- Document `.github/dependabot.yml` weekly schedule excerpt and automated review
  policy in `ARCHITECTURE.md`.

## 2.2.0 - 2026-10-12

- Trust-boundary validation and schemas extracted into `bunpm/core/validate.js`
  with frozen `INPUT_VALIDATION_PATTERNS` regex schemas, `validateArgs`,
  `validateManager`, `validateBinary`, and `validateUrl`.
- Multi-level structured diagnostics (`error`, `warn`, `info`, `debug`) and
  exported frozen `logger` API (`logger.error`, `logger.warn`, `logger.info`,
  `logger.debug`) in `bunpm/core/log.js` matching documented schema.
- All 13 test files wrapped in named `describe()` suites, exposing 13 runnable test
  suites to Node's test runner and static repository analyzers.
- Extended CLI flag translations in `bunpm/core/mapper.js`: `--dry-run` and `-s`
  (silent) mapped across `npm`, `yarn`, and `pnpm`.
- Automated release workflow in `.github/workflows/release.yml` publishing
  official GitHub releases upon `v*` tag pushes.
- `bunpm doctor` checks the Node.js version, finds Bun and runs `bun --version`,
  checks the launchers and lists the original managers. It exits 1 on any
  failed check.
- SIGINT and SIGTERM received by the wrapper are forwarded to a streamed Bun
  child, and the wrapper waits for Bun to exit instead of quitting first.
- `yarn` invocations in Yarn Berry Plug'n'Play projects (detected by `.pnp.cjs`
  or `.pnp.js` in current working directory) fall back to native Yarn, avoiding
  conflicting `node_modules` generation.
- Unix uninstaller (`uninstall.sh` on Linux and macOS) removes the preceding
  empty line introduced during installation, preventing blank line buildup.

## 2.1.0 - 2026-10-08

- `pnpm install <pkg>` falls back to pnpm; `bun install` ignores package names,
  so the package was silently not added.
- `npm install -g` with no package falls back to npm, which installs the current
  folder globally; it was sent to `bun install -g`, which does not.

- Non-interactive commands (`install`, `add`, `remove`, `update`, ...) stream
  formatted output while Bun runs instead of printing it after exit. The 16 MiB
  capture limit is gone: output beyond it used to kill Bun mid-install
  (ENOBUFS). Exit codes and the pre-start fallback are unchanged.
- `BUNPM_DEBUG=1` adds one JSON line per bunpm diagnostic on stderr.

- Boolean options given an explicit value (`npm install --save=false pkg`,
  `-D=false`) now fall back to the original manager. Previously `--save=false`
  was dropped and Bun saved the dependency.
- `npm run <script> --flag`, `npm test --flag` and similar fall back to npm.
  npm reads options after the script name as its own config and does not pass
  them to the script, while Bun forwarded them. Options after `--` and
  positional script arguments are still translated.
- Install output formatting now matches Bun 1.3's piped output, which is not
  indented, so it applies at all; previously every line passed through
  unchanged. Bun's "no changes" summary maps to the manager's up-to-date text.

- Report every bunpm failure on stderr as `bunpm: <component>: <message>`,
  replacing the previous mix of `bunpm error:`, `Bootstrap error:` and unprefixed
  installer messages. Missing installer prerequisites are now reported by bunpm
  instead of by the shell, and the missing-manager and prerequisite texts were
  reworded to name the tool to install. Exit codes, signal handling and child
  output are unchanged. Scripts matching the old prefixes or texts need updating.
- Report a missing `SystemRoot`/`WINDIR` as such when a generic Windows batch
  fallback needs `cmd.exe`, instead of an internal `path.join` type error.
- Unix installers distinguish a missing `node`/`bun` from one whose `--version`
  fails, as the Windows installer already did, and no longer hide that tool's
  own error output.
- Avoid missing-profile diagnostics on fresh Unix installs while retaining PATH
  idempotence. Preserve raw Windows User PATH references and registry value type.
- Permit quoted batch executable paths containing parentheses and literal wildcard
  arguments, while retaining rejection of shell-sensitive argument syntax.

- Return actual original-manager versions instead of fabricated version strings.
- Run package test scripts through `bun run test`, preserving script arguments.
- Fall back for unknown options, Yarn shorthand, `ci`, `init`, `exec`, version
  mutation, and other commands without a safe common Bun equivalent. Yarn shorthand
  no longer accidentally installs a package. Original managers must be installed
  for fallback operations.
- Find executables without invoking a shell; skip wrapper copies, directories,
  relative PATH entries and broken symlinks.
- Preserve child failures and signal exit codes. Retry only pre-execution missing
  executable/permission failures, never buffer overflows or failed commands.
- On Windows, invoke known Node package-manager entrypoints directly. Generic
  batch shims reject shell-sensitive arguments; use a Node CLI entrypoint for
  those arguments. Interactive commands retain the terminal.
- Remove invented audit results from formatted output.
- Require an immutable commit SHA for remote bootstrap. Restrict HTTPS URLs and
  redirects to this repository/revision, cap time/size/redirects, propagate stream
  errors, and never invoke an installer after a failed download.
- Require Bun to be installed separately instead of executing a remote install
  script automatically. Installers also work directly from the checked-out source.
- Add explicit no-PATH installation/uninstallation modes for isolated testing and
  manual PATH management. Uninstall preserves unrelated shell-profile lines.
- Close redirect/error responses promptly and validate download resource limits.
