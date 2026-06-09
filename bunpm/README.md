<p align="center">
  <img src="https://img.shields.io/badge/npm-CB3837?style=for-the-badge&logo=npm&logoColor=white" alt="npm" />
  <img src="https://img.shields.io/badge/powered%20by-Bun-f472b6?style=for-the-badge&logo=bun&logoColor=white" alt="Bun" />
  <img src="https://img.shields.io/badge/platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="MIT License" />
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

Open **Windows PowerShell** and run:

```powershell
irm https://raw.githubusercontent.com/yv3000/bunpm/main/bunpm/bootstrap.js -OutFile "$env:TEMP\bunpm_bootstrap.js"; node "$env:TEMP\bunpm_bootstrap.js"
```

Or clone and run:

```powershell
git clone https://github.com/yv3000/bunpm.git
cd bunpm
node bootstrap.js
```

That's it. **One command. No other steps.**

The installer will:
1. Auto-install Bun if not present
2. Verify Node.js is available
3. Copy wrapper files to `~/.bunpm/`
4. Prepend to both User and System PATH
5. Verify everything works

---

## Uninstall bunpm

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.bunpm\scripts\uninstall.ps1"
```

This removes the `~/.bunpm` folder and cleans your PATH entirely — both User and System level. Original npm is instantly restored. Bun stays installed (it's a separate tool).

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

## What Happens After Install

```
Before bunpm                          After bunpm
--------------                        ---------------
npm install express  (3.2s)    -->    npm install express  (0.2s)
npm run build        (npm)     -->    npm run build        (bun)
npx create-vite      (npm)     -->    npx create-vite      (bunx)
npm test             (npm)     -->    npm test             (bun)
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
    User sees: added express@4.18.2  (in 0.2s instead of 3.2s)
```

### PATH Hijack (Safe)

bunpm works by **prepending** `~/.bunpm/bin/` to your PATH. When you type `npm`, Windows searches PATH left-to-right:

1. **`C:\Users\you\.bunpm\bin\npm.cmd`** ← Found first. Our wrapper runs.
2. `C:\Program Files\nodejs\npm.cmd` ← Original npm, untouched, still there as fallback.

The original npm is never modified, deleted, or renamed.

---

## Fallback Behavior

bunpm is designed to **never break your workflow**:

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

## Platform Support

| Platform | Status |
|---|---|
| Windows | ✅ Supported |
| macOS / Linux | 🔜 Coming soon |

---

## Tech Stack

- Plain JavaScript — CommonJS, Node.js built-ins only
- PowerShell installer — no external dependencies
- Zero `node_modules` needed for bunpm itself
- No build step — runs as plain `.js` files

---

## License

MIT

---

## Author

Built by **YV** ([@yv3000](https://github.com/yv3000)) · [linktr.ee/yv_3000](https://linktr.ee/yv_3000)

---

<p align="center">
  <sub>I EXPECT NOTHING FROM YOU...</sub>
</p>