# Contributing

Development requires Node.js 22.13+ and Bun 1.3.14. Runtime code remains plain
CommonJS with no external dependencies and no build step.

Install [ShellCheck](https://www.shellcheck.net/) and
[actionlint](https://github.com/rhysd/actionlint/blob/main/docs/install.md)
separately and put both executables on PATH for the full validation sequence.
`bun install` provides neither tool. Bash is needed for Unix script checks;
Windows installer checks require PowerShell.

From a fresh clone:

```sh
git clone https://github.com/yv3000/bunpm.git
cd bunpm
bun install --frozen-lockfile --ignore-scripts
bun run test
bun run test:coverage
bun run test:repeat
bun run syntax:check
bun run typecheck
bun run lint
bun run format:check
bun run audit
bun run smoke
bun run shell:check
actionlint
git diff --check
```

`npm ci`/`npm test` and their `bun` equivalents work the same, including on a
machine where bunpm intercepts `npm`.
ESLint, Prettier and TypeScript are pinned development-only dependencies.
`typecheck` runs TypeScript in strict `checkJs` mode over runtime code and
development scripts (see [`jsconfig.json`](jsconfig.json)); JSDoc annotations are
the type source and nothing is emitted. It uses `@types/node` 16 on purpose, so
runtime code calling a Node.js API added after the 16.x line fails the check.
Tests are not type-checked. Commit `bun.lock`
when intentionally updating tooling; never install tools during tests.
[`.github/dependabot.yml`](.github/dependabot.yml) proposes those tooling and
GitHub Actions updates weekly. Its pull requests are ordinary pull requests: they
must pass the same required checks and are never merged automatically.

Tests must exercise observable behavior, run offline, and clean their own fixtures.
Use the native platform for process and installer tests; a simulated platform name
does not prove execution on that OS. Keep behavior fixes and regression tests in
the same commit. Do not change global PATH, package-manager installs, or real shell
profiles in a test. Formatting-only work belongs in a separate commit.

## Diagnostics

bunpm's own failures go to stderr as `bunpm: <component>: <actionable message>`,
where the component is the failing part (`wrapper`, `exec`, `detector`,
`bootstrap`, `install`, `uninstall`, `doctor`). Runtime modules log through
[`core/log.js`](bunpm/core/log.js); `bootstrap.js` repeats the same format inline
because it must not import files it has not downloaded yet, and the
shell/PowerShell installers spell it out in their own messages. Child process
output is never rewritten into this form, and exit codes and cause text are
preserved. There are no log files or telemetry. `BUNPM_DEBUG=1` adds one JSON
line per diagnostic (`timestamp`, `level`, `component`, `message`, optional
`code`); `tests/log.test.js` pins that schema. Changing a diagnostic requires
updating its assertion in the matching `tests/*.test.js` file.

## Good first issues

Each is a real, self-contained gap; keep the fix and its test in one commit.

- Yarn Berry Plug'n'Play projects (with `.pnp.cjs`) get a `node_modules` folder
  when `yarn add` runs through Bun. A cwd check in `bunpm/core/wrapper.js` could
  fall back (the mapper stays I/O-free).
- Every Unix install/uninstall cycle leaves one blank line in the profile:
  `install.sh` writes a blank line before the marker and the `uninstall.sh` awk
  filter keeps it (`bunpm/platforms/{linux,macos}/scripts/`). Extend
  `tests/uninstall.test.js`.

## Verification Boundaries

`test:coverage` runs the suite under [c8](https://github.com/bcoe/c8), configured in
[`.c8rc.json`](.c8rc.json). On every OS it requires at least 90% lines,
functions and branches and 95% statements across all runtime JavaScript files (`bunpm/**/*.js`) combined. On
Windows CI also runs `npx c8 check-coverage --per-file`, requiring 90% in
**each** runtime file, including bootstrap, because
only Windows can execute `wrapper.js`'s batch-shim branch; on Unix that branch is
unreachable, so a per-file gate there would measure the platform, not the tests.
Files no test loads still count (`all: true`). The gate does not enforce a branch
threshold (c8 prints it); native subprocess execution is
covered by assertions, not counted as parent-process line coverage. CI runs the
gate on Ubuntu, macOS and Windows.

`test:repeat` launches three independent runs, randomized with fixed seeds when
Node supports `--test-randomize` (26.1+) and in file order otherwise.
`smoke` installs checked-out source into a disposable home, runs installed launchers
and package scripts, and uninstalls. Windows smoke uses `-NoPath` and never touches
the registry. Unix smoke modifies only disposable shell profiles. No test downloads
packages or calls GitHub; bootstrap tests redirect HTTP transport to a loopback
server while keeping production URL validation active.

Temporary fixtures and coverage reports use the OS temp directory and are cleaned
in `finally`/test teardown. Set `TEMP`/`TMP` on Windows or `TMPDIR` on Unix before
validation to choose an external test location. Set `BUN_INSTALL_CACHE_DIR` for an
external dependency cache; a directory junction/symlink at `node_modules` can keep
installed development dependencies outside the checkout. Do not commit local paths.

ShellCheck validates both Unix script trees; `bash -n` supplies an additional syntax
check. Native PowerShell parsing validates `.ps1` syntax. `actionlint` validates the
workflow; CI installs pinned actionlint 1.7.7 only when unavailable. CI pins every
action to a full commit SHA, uses read-only permissions, no retained
checkout credentials, and no remote bootstrap, so installer sources match checkout.

Dependency audit needs registry access; report registry failures as unavailable,
not a clean audit. Report native OS tests as pending until their runner actually
passes. No scanner score is claimed without an actual scanner result.
