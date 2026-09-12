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
bun test
bun run test:coverage
bun run test:repeat
bun run syntax:check
bun run lint
bun run format:check
bun run audit
bun run smoke
bun run shell:check
actionlint
git diff --check
```

Use `bun`, not the intercepted `npm` command, for repository development.
ESLint and Prettier are pinned development-only dependencies. Commit `bun.lock`
when intentionally updating tooling; never install tools during tests.

Tests must exercise observable behavior, run offline, and clean their own fixtures.
Use the native platform for process and installer tests; a simulated platform name
does not prove execution on that OS. Keep behavior fixes and regression tests in
the same commit. Do not change global PATH, package-manager installs, or real shell
profiles in a test. Formatting-only work belongs in a separate commit.

## Diagnostics

bunpm's own failures go to stderr as `bunpm: <component>: <actionable message>`,
where the component is the failing part (`wrapper`, `exec`, `detector`,
`bootstrap`, `install`, `uninstall`). `core/wrapper.js` has a local `diagnose`
helper; `bootstrap.js` repeats the prefix inline because it must not import files
it has not downloaded yet, and the shell/PowerShell installers spell it out in
their own messages. Child process output is never rewritten into this form, exit
codes and cause text are preserved, and there are no timestamps, log files or
telemetry. Changing a diagnostic requires updating its assertion in
`tests/wrapper.test.js`, `tests/bootstrap.test.js`, or `tests/smoke.test.js`.

## Verification Boundaries

`test:coverage` reads real Bun LCOV output and requires at least 90% lines and
functions in **each** runtime JavaScript file, including bootstrap. Missing files
fail the gate. Only tests and development scripts are excluded. Bun coverage does
not provide a branch threshold here; native subprocess execution is covered by
assertions, not counted as parent-process line coverage.
The CI coverage gate runs on Windows, where the additional batch-spawn branches
can execute. Unix jobs still execute their native tests and installer smoke;
their local coverage can be lower because Windows code cannot run natively there.

`test:repeat` launches three independent randomized runs with fixed printed seeds.
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
workflow; CI installs pinned actionlint 1.7.7 only when unavailable. CI uses versioned
actions consistent with the repository baseline, read-only permissions, no retained
checkout credentials, and no remote bootstrap, so installer sources match checkout.

Dependency audit needs registry access; report registry failures as unavailable,
not a clean audit. Report native OS tests as pending until their runner actually
passes. No scanner score is claimed without an actual scanner result.
