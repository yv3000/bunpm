<p align="center">
  <a href="https://www.npmjs.com"><img src="https://img.shields.io/badge/npm-CB3837?style=for-the-badge&logo=npm&logoColor=white" alt="npm" /></a>
  <a href="https://classic.yarnpkg.com"><img src="https://img.shields.io/badge/yarn-2C8EBB?style=for-the-badge&logo=yarn&logoColor=white" alt="yarn" /></a>
  <a href="https://pnpm.io"><img src="https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white" alt="pnpm" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/powered%20by-Bun-f472b6?style=for-the-badge&logo=bun&logoColor=white" alt="Bun" /></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="MIT License" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white" alt="macOS" />
  <img src="https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Linux" />
</p>

<h1 align="center">bunpm</h1>
<p align="center"><b>npm, yarn, and pnpm — at the speed of Bun.</b></p>
<p align="center">Type the same commands you already know. Bun runs underneath. Completely transparent. 10-25x faster installs.</p>
<p align="center"><b>v2.0 — now cross-platform (Windows, macOS, Linux) and supports npm, yarn, and pnpm.</b></p>

---

## What is bunpm?

**bunpm** is a transparent drop-in wrapper that intercepts `npm`, `npx`, `yarn`, and `pnpm` commands and silently runs them through [Bun](https://bun.sh) — the blazing-fast JavaScript runtime and package manager.

- You keep typing `npm install`, `yarn add`, `pnpm add`, `npx create-vite` — same commands, same flags, same muscle memory, whichever tool you're used to.
- Under the hood, Bun does the heavy lifting at 10-25x the speed.
- Your original npm, yarn, and pnpm are **never touched, modified, or replaced**. bunpm uses a PATH priority trick to intercept calls first — nothing on your system is overwritten.
- Output looks like the tool you actually invoked — `npm install` prints npm-style output, `yarn add` prints yarn-style output, `pnpm add` prints pnpm-style output. Bun did the work either way.

> **Think of it as a turbocharger.** You don't change how you drive — the car just goes faster, no matter which one you're driving.

---

## Install

bunpm auto-detects your OS and downloads **only** the files for your platform — a Linux install never touches Windows files, a Windows install never touches macOS/Linux shell scripts.

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/yv3000/bunpm/main/bunpm/bootstrap.js -OutFile "$env:TEMP\bunpm_bootstrap.js"; node "$env:TEMP\bunpm_bootstrap.js"
```

### macOS (Terminal — zsh or bash)

```bash
curl -fsSL https://raw.githubusercontent.com/yv3000/bunpm/main/bunpm/bootstrap.js -o /tmp/bunpm_bootstrap.js && node /tmp/bunpm_bootstrap.js
```

### Linux (Terminal — any distro with Node.js)

```bash
curl -fsSL https://raw.githubusercontent.com/yv3000/bunpm/main/bunpm/bootstrap.js -o /tmp/bunpm_bootstrap.js && node /tmp/bunpm_bootstrap.js
```

One command. No config. No flags to remember.

The installer will:
1. Auto-install Bun if not already present
2. Verify Node.js is available
3. Copy wrapper files into `~/.bunpm/` (or `%USERPROFILE%\.bunpm\` on Windows)
4. Add `npm`, `npx`, `yarn`, and `pnpm` launchers to your PATH (Windows: User + System registry · macOS: `.zprofile`/`.zshrc`/`.bash_profile` · Linux: `.bashrc`/`.zshrc`/`.profile`)
5. Verify everything works

---

## Uninstall

### Windows
```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.bunpm\scripts\uninstall.ps1"
```

### macOS / Linux
```bash
bash "$HOME/.bunpm/scripts/uninstall.sh"
```

Removes the `.bunpm` folder entirely and cleans up every PATH entry it added. Your original npm/yarn/pnpm are restored instantly — they were never touched in the first place. Bun itself stays installed (it's a separate, useful tool on its own).

---

## Proof it works

```bash
npm --version          # 10.8.2  (wrapper active)
yarn --version          # 1.22.22 (wrapper active)
pnpm --version          # 9.12.0  (wrapper active)

npm install express    # installed via Bun, npm-style output
yarn add express        # installed via Bun, yarn-style output
pnpm add express        # installed via Bun, pnpm-style output

npx create-vite         # interactive prompts work
yarn dlx create-vite     # interactive prompts work
pnpm dlx create-vite     # interactive prompts work
```

---

## Speed Comparison

```
Before bunpm                          After bunpm
--------------                        ---------------
npm install express  (~10s)    -->    npm install express  (~2s)
yarn add express      (~8s)     -->    yarn add express      (~0.1s)
pnpm add express      (~6s)     -->    pnpm add express      (~0.1s)
135 packages (cold)   (~3 min)  -->    135 packages (cold)   (~2s cached)
```

Same commands. Same output style. Just faster — every time, regardless of which package manager you reach for.

---

## Command Mapping

### npm → Bun

| npm command | Bun equivalent | Notes |
|---|---|---|
| `npm install` | `bun install` | Install all deps from package.json |
| `npm install <pkg>` | `bun add <pkg>` | Add a specific package |
| `npm i -D <pkg>` | `bun add -d <pkg>` | Add as dev dependency |
| `npm i -g <pkg>` | `bun add -g <pkg>` | Global install |
| `npm uninstall <pkg>` | `bun remove <pkg>` | Remove a package |
| `npm run <script>` | `bun run <script>` | Run package.json scripts |
| `npm start` | `bun run start` | Start script shorthand |
| `npm test` | `bun test` | Run tests |
| `npm update` | `bun update` | Update dependencies |
| `npm ci` | `bun install --frozen-lockfile` | Clean/reproducible install |
| `npm init` | `bun init` | Initialize new project |
| `npm create <X>` | `bun create <X>` | Create from template |
| `npm exec <X>` | `bun x <X>` | Execute package binary |
| `npm link` | `bun link` | Link local package |
| `npm rebuild` | `bun rebuild` | Rebuild native modules |
| `npm list` | `bun pm ls` | List installed packages |
| `npx <X>` | `bunx <X>` | Execute package directly — interactive prompts supported |

Falls back to real npm for: `publish` · `login` · `logout` · `whoami` · `audit` · `pack` · `fund` · `deprecate` · `dist-tag` · `access` · `team` · `profile` · `org` · `token` · `hook` · `adduser`

### yarn → Bun (NEW in v2)

| yarn command | Bun equivalent | Notes |
|---|---|---|
| `yarn` / `yarn install` | `bun install` | Install all deps |
| `yarn add <pkg>` | `bun add <pkg>` | Add a package |
| `yarn <pkg>` | `bun add <pkg>` | yarn's shorthand for add, also works |
| `yarn add -D <pkg>` | `bun add -d <pkg>` | Dev dependency |
| `yarn global add <pkg>` | `bun add -g <pkg>` | Global install |
| `yarn remove <pkg>` | `bun remove <pkg>` | Remove a package |
| `yarn run <script>` | `bun run <script>` | Run a script |
| `yarn upgrade` / `yarn up` | `bun update` | Update dependencies |
| `yarn why <pkg>` | `bun pm why <pkg>` | Explain why a package is installed |
| `yarn dlx <pkg>` | `bunx <pkg>` | Run a package once, interactive prompts work |
| `yarn exec <pkg>` | `bunx <pkg>` | Berry's exec, same as dlx |
| `yarn link` / `unlink` | `bun link` / `bun unlink` | Local package linking |
| `yarn list` | `bun pm ls` | List installed packages |

Falls back to real yarn for: `audit` · `login` · `logout` · `publish` · `pack` · `config` · `workspaces` · `workspace` · `set` · `plugin` · `constraints` (Berry-specific tooling with no Bun equivalent)

### pnpm → Bun (NEW in v2)

| pnpm command | Bun equivalent | Notes |
|---|---|---|
| `pnpm install` / `pnpm i` | `bun install` | Install all deps |
| `pnpm add <pkg>` | `bun add <pkg>` | Add a package |
| `pnpm remove <pkg>` | `bun remove <pkg>` | Remove a package |
| `pnpm run <script>` | `bun run <script>` | Run a script |
| `pnpm update` / `pnpm up` | `bun update` | Update dependencies |
| `pnpm why <pkg>` | `bun pm why <pkg>` | Explain why a package is installed |
| `pnpm dlx <pkg>` | `bunx <pkg>` | Run a package once, interactive prompts work |
| `pnpm link` / `unlink` | `bun link` / `bun unlink` | Local package linking |
| `pnpm list` | `bun pm ls` | List installed packages |
| `pnpm rebuild` | `bun rebuild` | Rebuild native modules |

Falls back to real pnpm for: `store` · `audit` · `login` · `logout` · `publish` · `pack` · `config` · `patch` · `patch-commit` · `deploy` · and **any command using `-r`, `--recursive`, or `--filter`** (workspace-scoped operations always use real pnpm for safety, since Bun's workspace filtering isn't guaranteed identical)

---

## How It Works

### Architecture

```
~/.bunpm/
├── bin/
│   ├── npm / npm.cmd      # launcher
│   ├── npx / npx.cmd      # launcher
│   ├── yarn / yarn.cmd    # launcher (NEW)
│   └── pnpm / pnpm.cmd    # launcher (NEW)
├── core/                  # shared logic, identical on every OS
│   ├── wrapper.js         # main entry point — detects tool, maps command, runs Bun, formats output
│   ├── mapper.js          # npm/yarn/pnpm command → bun command translation tables
│   ├── formatter.js       # bun output → npm-style / yarn-style / pnpm-style output
│   ├── detector.js        # finds bun, yarn, pnpm binaries on the system
│   └── platform-detect.js # OS detection, used at install time and runtime
└── scripts/
    ├── install.ps1 (Windows) or install.sh (macOS/Linux)
    └── uninstall.ps1 (Windows) or uninstall.sh (macOS/Linux)
```

### The Flow

```
User types: yarn add express
        |
        v
   yarn launcher (in ~/.bunpm/bin/ — found first on PATH)
        |
        v
   core/wrapper.js yarn add express
        |
        v
   detector.js  -->  finds bun on this system
   mapper.js    -->  translates yarn's "add" to: bun add express
   formatter.js -->  reformats bun's output to look like yarn's output
        |
        v
   User sees: success Saved 1 new dependency.   (yarn-style, Bun-fast)
```

### PATH Hijack (Safe, Reversible)

bunpm works by **prepending** `~/.bunpm/bin/` to your PATH — it never touches the real npm/yarn/pnpm binaries:

1. **`~/.bunpm/bin/npm`** ← found first by the shell/Windows, our wrapper runs
2. The original npm/yarn/pnpm installs ← untouched, still exactly where they were, used as fallback

Uninstalling removes only the PATH entry — your original tools are back instantly with zero residue.

---

## Fallback Behavior

| Scenario | What happens |
|---|---|
| Bun not found at runtime | Falls back to the real npm/yarn/pnpm silently |
| Command not supported by Bun (e.g. `npm publish`, `yarn login`) | Falls back to the real tool |
| pnpm workspace command (`-r`, `--filter`) | Falls back to real pnpm automatically, every time |
| Bun crashes mid-command | Falls back to the real tool + prints a warning |
| Tool you're calling (yarn/pnpm) isn't even installed on your machine | Still works — bunpm doesn't require yarn/pnpm to be pre-installed, it intercepts the command and runs Bun regardless |

---

## Platform Support

| Platform | Status |
|---|---|
| Windows 10/11 | ✅ Fully supported |
| macOS (Intel & Apple Silicon) | ✅ Fully supported |
| Linux (any distro with Node.js) | ✅ Fully supported |

## Package Manager Support

| Tool | Status |
|---|---|
| npm / npx | ✅ Fully routed through Bun |
| yarn (Classic & Berry common subset) | ✅ Fully routed through Bun |
| pnpm | ✅ Fully routed through Bun, except workspace-filtered commands which fall back to real pnpm |

---

## Known Behavioral Differences

- **pnpm users**: pnpm normally enforces a strict, non-phantom `node_modules` structure. When bunpm routes pnpm commands through Bun, you get Bun's flatter `node_modules` layout instead — closer to npm's behavior. If your project relies on pnpm's strict isolation to catch phantom dependency bugs, that safety net isn't preserved while bunpm is active.
- **yarn users**: yarn's classic `[1/4] Resolving / Fetching / Linking / Building` phase-by-phase progress isn't reproduced, since Bun's install pipeline doesn't have the same internal phases. You'll see a yarn-styled success summary, just without the phase breakdown — this is intentional honesty rather than faking steps that aren't actually happening.
- **pnpm workspace commands**: any command using `-r`, `--recursive`, or `--filter` always falls back to your real pnpm install, since workspace-scoped filtering needs pnpm's own logic to target the right packages safely.

---

## Shell Compatibility

| Shell | Status |
|---|---|
| Windows CMD | ✅ Fully supported |
| Windows PowerShell | ✅ Fully supported |
| Windows Terminal | ✅ Fully supported |
| Git Bash (Windows) | ✅ Supported |
| zsh (macOS default) | ✅ Fully supported |
| bash (macOS / Linux) | ✅ Fully supported |

---

## Requirements

| Requirement | Details |
|---|---|
| **OS** | Windows 10/11, macOS, or Linux |
| **Node.js** | v16+ |
| **Bun** | Auto-installed if missing |
| **Admin/sudo** | Not required for standard install (Windows System PATH step is optional and self-elevates only if you choose) |

---

## FAQ

**Will this break my existing projects?**
No. Your `package.json`, `node_modules`, and lockfiles all work the same way regardless of which package manager you invoke.

**Does this affect `node` or other commands?**
No. Only `npm`, `npx`, `yarn`, and `pnpm` are intercepted.

**Do I need yarn or pnpm already installed to use the yarn/pnpm wrapping?**
No. bunpm intercepts the command either way — even if yarn or pnpm was never installed on your machine, typing `yarn add express` or `pnpm add express` still works through Bun.

**Can I temporarily bypass bunpm?**
Yes — call the original binary directly with its full path, bypassing PATH lookup entirely.

**How do I update bunpm?**
Re-run the install one-liner for your OS — or uninstall and reinstall for a completely clean update.

---

## Tech Stack

- Plain JavaScript — CommonJS, Node.js built-ins only, zero external dependencies
- PowerShell installer (Windows) / Bash installer (macOS, Linux)
- Zero `node_modules` needed for bunpm itself
- No build step — runs as plain `.js` files everywhere

---

## License <a name="license"></a>

MIT License

Copyright (c) 2026 THE YV

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

<p align="center">
  <sub>YV 🖤 ~ I EXPECT NOTHING FROM YOU...</sub>
</p>