# Contributing

Development requires Node.js 22.13+ and Bun 1.3.14. Runtime code remains plain
CommonJS with no external dependencies and no build step.

From a fresh clone:

```sh
git clone https://github.com/yv3000/bunpm.git
cd bunpm
bun install --frozen-lockfile
bun test
bun run test:repeat
bun run syntax:check
bun run lint
bun run format:check
bun run audit
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
