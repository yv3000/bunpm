<p align="center">
  <a href="https://www.npmjs.com"><img src="https://img.shields.io/badge/npm-CB3837?style=for-the-badge&logo=npm&logoColor=white" alt="npm" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/powered%20by-Bun-f472b6?style=for-the-badge&logo=bun&logoColor=white" alt="Bun" /></a>
  <a href="https://www.microsoft.com/windows"><img src="https://img.shields.io/badge/platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" /></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="MIT License" /></a>
</p>

<h1 align="center">bunpm</h1>
<p align="center"><b>npm at the speed of Bun.</b></p>
<p align="center">Type <code>npm</code>, run <b>Bun</b>. Completely transparent. 10-25x faster installs.</p>

---

## What is bunpm?

**bunpm** is a transparent drop-in wrapper that intercepts all `npm` and `npx` commands and silently runs them through [Bun](https://bun.sh) — the blazing-fast JavaScript runtime and package manager.

- You keep typing `npm install`, `npm run dev`, `npx create-vite` — same commands, same flags, same muscle memory.
- Under the hood, Bun does the heavy lifting at 10-25x the speed.
- Your original npm is **never touched or modified**. bunpm uses a PATH priority trick to intercept calls first.

> **Think of it as a turbocharger for npm.** You don't change how you drive — the car just goes faster.

---

## Install

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/yv3000/bunpm/main/bootstrap.js -OutFile "$env:TEMP\bunpm_bootstrap.js"; node "$env:TEMP\bunpm_bootstrap.js"
```

### macOS (Terminal, zsh or bash)

```bash
curl -fsSL https://raw.githubusercontent.com/yv3000/bunpm/main/bootstrap.js -o /tmp/bunpm_bootstrap.js && node /tmp/bunpm_bootstrap.js
```

### Linux (Terminal, any distro with Node.js installed)

```bash
curl -fsSL https://raw.githubusercontent.com/yv3000/bunpm/main/bootstrap.js -o /tmp/bunpm_bootstrap.js && node /tmp/bunpm_bootstrap.js
```

The bootstrapper automatically detects your operating system and downloads **only** the files relevant to your platform — a Linux install never touches Windows-specific files and vice versa.

The installer will:
1. Auto-install Bun if not present
2. Verify Node.js is available
3. Copy wrapper files into `~/.bunpm/` (or `%USERPROFILE%\.bunpm\` on Windows)
4. Update your PATH (registry on Windows; shell profile file on macOS/Linux)
5. Verify everything works

## Uninstall

### Windows
```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.bunpm\scripts\uninstall.ps1"
```

### macOS / Linux
```bash
bash "$HOME/.bunpm/scripts/uninstall.sh"
```

---

## Proof it works

```powershell
npm --version        # shows 10.8.2 (wrapper active, not real npm)
npm install express  # installed in ~0.2s instead of 3-5s
npm run dev          # runs via bun
npx create-vite      # runs via bunx
where npm            # shows C:\Users\you\.bunpm\bin\npm.cmd first
```

---

## Speed Comparison

```
Before bunpm                          After bunpm
--------------                        ---------------
npm install express  (~10s)    -->    npm install express  (2.46s)
react + react-dom    (~15s)    -->    react + react-dom    (2.64s)
135 packages         (~3 min)  -->    135 packages         (1.98s cached)
```

Same commands. Same output. Just faster.

---

## Command Mapping

### Commands routed through Bun

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
| `npx <X>` | `bunx <X>` | Execute package directly |

### Commands that fall back to original npm

> `publish` · `login` · `logout` · `whoami` · `audit` · `pack` · `fund` · `deprecate` · `dist-tag` · `access` · `team` · `profile` · `org` · `token` · `hook` · `adduser`

### Flag Translation

| npm flag | Bun equivalent |
|---|---|
| `--save-dev` / `-D` | `-d` |
| `--save-exact` / `-E` | `-E` |
| `--global` / `-g` | `-g` |
| `--save` / `-S` | *(dropped — bun saves by default)* |
| `--force` / `-f` | `--force` |
| `--frozen-lockfile` | `--frozen-lockfile` |
| `--production` | `--production` |
| `--legacy-peer-deps` | *(dropped — bun handles differently)* |
| `--silent` / `--quiet` / `-q` | `--silent` |

---

## How It Works

### Architecture

```
~/.bunpm/
├── bin/
│   ├── npm.cmd          # Windows CMD launcher
│   ├── npm              # Unix-style shebang (PowerShell/Git Bash)
│   ├── npx.cmd          # Windows CMD launcher
│   └── npx              # Unix-style shebang
├── lib/
│   ├── wrapper.js       # Main entry point - orchestrates everything
│   ├── mapper.js        # npm command → bun command translation
│   ├── formatter.js     # bun output → npm-style output
│   └── detector.js      # Finds bun/bunx executables on system
└── package.json
```

### The Flow

```
User types: npm install express
        |
        v
    npm.cmd (in ~/.bunpm/bin/ — found first on PATH)
        |
        v
    node wrapper.js npm install express
        |
        v
    detector.js  -->  finds bun at ~/.bun/bin/bun.exe
    mapper.js    -->  translates to: bun add express
    formatter.js -->  reformats output to look like npm
        |
        v
    User sees: added express@4.18.2  (in ~2s instead of ~10s)
```

### PATH Hijack (Safe)

bunpm works by **prepending** `~/.bunpm/bin/` to your PATH:

1. **`C:\Users\you\.bunpm\bin\npm.cmd`** ← Found first. Our wrapper runs.
2. `C:\Program Files\nodejs\npm.cmd` ← Original npm, untouched, still there as fallback.

The original npm is never modified, deleted, or renamed.

---

## Fallback Behavior

| Scenario | What happens |
|---|---|
| Bun not found at runtime | Falls back to original npm silently |
| Command not supported by Bun | Falls back to original npm |
| Bun crashes mid-command | Falls back to original npm + prints warning |
| Unknown/new npm command | Falls back to original npm |

---

## Shell Compatibility

| Shell | Status |
|---|---|
| CMD | ✅ Fully supported |
| PowerShell | ✅ Fully supported |
| Windows Terminal | ✅ Fully supported |
| Git Bash | ✅ Supported |

---

## Requirements

| Requirement | Details |
|---|---|
| **OS** | Windows 10 / Windows 11 |
| **Node.js** | v16+ |
| **Bun** | Auto-installed if missing |
| **Admin** | Only for System PATH step (optional) |

---

## Platform Support

| Platform | Status |
|---|---|
| Windows 10/11 | ✅ Supported |
| macOS (Intel & Apple Silicon) | ✅ Supported |
| Linux (any distro with Node.js) | ✅ Supported |

## Package Manager Support

| Tool | Status |
|---|---|
| npm / npx | ✅ Fully routed through Bun |
| yarn (Classic & Berry common subset) | ✅ Fully routed through Bun |
| pnpm | ✅ Fully routed through Bun, except workspace-filtered commands (`-r`, `--filter`) which fall back to real pnpm for safety |

---

## Known Behavioral Differences

- **pnpm users**: pnpm normally enforces strict, non-phantom `node_modules` structure. When bunpm routes pnpm commands through Bun, you get Bun's flatter `node_modules` layout instead — closer to npm's behavior than pnpm's usual strictness. If your project relies on pnpm's strict dependency isolation to catch phantom dependency bugs, be aware this safety net is not preserved while bunpm is active.
- **yarn users**: yarn's `[1/4] Resolving / Fetching / Linking / Building` phase-by-phase progress display is not reproduced, since Bun's install pipeline doesn't have the same internal phase structure. You'll see a yarn-styled success summary, just without the phase breakdown.
- **pnpm workspace commands**: any command using `-r`, `--recursive`, or `--filter` automatically falls back to your real pnpm installation rather than being routed through Bun, since workspace-scoped operations need pnpm's own filtering logic to target the correct set of packages safely.

---

## FAQ

**Will this break my existing projects?**
No. Your `package.json`, `node_modules`, and lockfiles all work the same way.

**Does this affect `node` or other commands?**
No. Only `npm` and `npx` are intercepted.

**Can I temporarily bypass bunpm?**
Yes — call original npm directly:
```powershell
& "C:\Program Files\nodejs\npm.cmd" install express
```

**How do I update bunpm?**
```powershell
git pull
node bootstrap.js
```

---

## Tech Stack

- Plain JavaScript — CommonJS, Node.js built-ins only
- PowerShell installer — no external dependencies
- Zero `node_modules` needed for bunpm itself
- No build step — runs as plain `.js` files

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