# Contributing to bunpm

bunpm intercepts `npm`, `npx`, `yarn`, and `pnpm` and routes them through Bun. It is plain
CommonJS JavaScript with **zero runtime dependencies** — that constraint shapes almost every
decision below, so please read the [Hard rules](#hard-rules) section before opening a PR.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 16 or newer | The wrapper itself runs under Node, not Bun |
| Bun | any recent 1.x | Test runner, and the thing bunpm delegates to |
| Git | any | — |

## Setup

```bash
git clone https://github.com/yv3000/bunpm.git
cd bunpm
bun install --frozen-lockfile
```

`bun install` only installs the repo's dev tooling (eslint, prettier) from the committed
`bun.lock`. It installs nothing for the shipped package — `bunpm/package.json` has no
dependencies and must stay that way.

## Everyday commands

Run these from the repo root:

```bash
bun test bunpm/core/     # unit tests
bun run lint             # eslint over bunpm/core and bunpm/bootstrap.js
bun run format           # prettier check (does not write)
bun run check-syntax     # node --check on every shipped file
```

Or from inside the package directory:

```bash
cd bunpm && bun test core/
```

CI runs exactly these, in the `test-unit` job, before any live-install job starts.
`no-console` is a **warning**, not an error — this is a CLI tool and `console.error` is the
correct way to talk to the user. Lint must stay at **0 errors**.

## How the PATH hijack works

Nothing is overwritten or patched. The installer prepends `~/.bunpm/bin` to your PATH, and
that directory contains launcher scripts named `npm`, `npx`, `yarn`, `pnpm`. Because the
shell searches PATH left to right, our launcher is found before the real binary:

```
User types: yarn add express
   -> ~/.bunpm/bin/yarn          (found first on PATH)
   -> node ~/.bunpm/core/wrapper.js yarn add express
   -> detector.js   finds bun on this system
   -> mapper.js     turns "yarn add express" into "bun add express"
   -> formatter.js  makes bun's output read like yarn's output
   -> User sees yarn-style output, at Bun speed
```

The real npm/yarn/pnpm binaries stay exactly where they were and are used as the fallback
path. Uninstalling removes only the PATH entry.

Two consequences worth internalising before you change anything:

- **Every code path must have a fallback.** If bun is missing, if bun cannot express the
  command (`npm publish`), or if bun crashes, the original binary has to run instead.
  Breaking that turns a speed optimisation into a broken `npm`.
- **`wrapper.js` receives the tool name as `argv[2]`**, injected by the launcher. It is
  validated at the top of `main()` and is never user-typed.

## Where to make which change

| You want to... | Edit |
|---|---|
| Support a new subcommand or flag | `bunpm/core/mapper.js` (+ `mapper.test.js`) |
| Change how output looks | `bunpm/core/formatter.js` (+ `formatter.test.js`) |
| Change how binaries are located | `bunpm/core/detector.js` |
| Add or change an error message | `bunpm/core/errors.js` (+ `errors.test.js`) |
| Change spawn/fallback behaviour | `bunpm/core/wrapper.js` |
| Add an OS-level path or profile rule | `bunpm/core/platform-detect.js` |
| Change install/uninstall behaviour | `bunpm/platforms/<os>/scripts/` |
| Add a file to `core/` | also add it to `CORE_FILES` in `bunpm/bootstrap.js` |

That last row is enforced by `bunpm/core/download-manifest.test.js`. `bootstrap.js`
downloads an explicit file list onto the user's machine, so a new `core/` module that is
required but not listed produces an install that fails with `MODULE_NOT_FOUND` on first
use. The test derives the require graph from source and fails if the list drifts.

## Hard rules

1. **No external npm dependencies, ever.** Node built-ins only (`fs`, `path`,
   `child_process`, `os`, `https`). `eslint` and `prettier` in the root `package.json` are
   the only exception, they are dev-only, and they are declared at the repo root
   specifically so they never appear in the `bunpm/package.json` that `bootstrap.js`
   downloads to user machines.
2. **`bunpm/core/*.js` must stay OS-agnostic.** Anything platform-specific belongs in
   `platform-detect.js` or under `platforms/`.
3. **Never change one copy of the platform detection logic.** `bootstrap.js` deliberately
   duplicates `detectPlatform()` because `core/` does not exist on disk yet when bootstrap
   runs. If you change one, change both.
4. **Errors get codes.** Throw `BunpmError` from `core/errors.js` rather than calling
   `console.error` + `process.exit`. Every code in `CODES` needs a factory and a call site.
5. **Every mapping or formatting change needs a test.** These are pure functions; there is
   no excuse for an untested one.

## Commit messages

Conventional commits, one logical change per commit:

```
feat:  new user-visible capability
fix:   bug fix
test:  tests only
chore: tooling, config, dependencies
ci:    workflow changes
docs:  documentation only
```

Example: `test: add mapper.js unit tests covering npm/yarn/pnpm command mapping`

## Testing a platform installer by hand

Unit tests cover the pure logic. Installers touch PATH and the real filesystem, so they
need a manual pass on a throwaway machine, VM, or container. Run the one-liner for the
platform from the README, then:

```bash
npm --version        # 10.8.2   (wrapper active, not your real npm version)
yarn --version       # 1.22.22
pnpm --version       # 9.12.0

mkdir /tmp/bunpm-check && cd /tmp/bunpm-check
npm init -y
npm install express  # node_modules/express exists, npm-style output
yarn add lodash      # node_modules/lodash exists, yarn-style output
pnpm add dayjs       # node_modules/dayjs exists, pnpm-style output
npm uninstall express

npm run dev          # a dev server streams output and does not appear to hang
npx create-vite      # interactive prompts respond to keystrokes
npm whoami           # falls back to real npm without crashing
```

Then uninstall and confirm nothing is left:

```bash
bash ~/.bunpm/scripts/uninstall.sh    # or uninstall.ps1 on Windows
# ~/.bunpm is gone, and npm --version reports your real npm again
```

Open a new shell for that last check — PATH changes do not apply retroactively to the
shell that ran the installer.

### Testing an installer change without pushing to main

`bunpm/bootstrap.js` downloads the file set from a raw GitHub URL, which normally means a
change to `CORE_FILES` or `PLATFORM_FILES` can only be verified after it has landed on
`main`. `BUNPM_REPO_BASE` overrides that base URL:

```bash
# serve the repo's bunpm/ directory over http, then point bootstrap at it
cd bunpm && python3 -m http.server 8000 &
BUNPM_REPO_BASE=http://localhost:8000 node bunpm/bootstrap.js
```

It also works against a fork or branch:

```bash
BUNPM_REPO_BASE=https://raw.githubusercontent.com/<you>/bunpm/<branch>/bunpm \
  node bunpm/bootstrap.js
```

Bootstrap prints the override in its output when it is set. Treat that line as a security
notice, not decoration: the base URL is where install scripts are fetched from and those
scripts are then executed. Never set it to a host you do not control or trust.
