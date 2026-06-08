# bunpm — npm at the speed of Bun

Types `npm`, runs **Bun**. Completely transparent.

Your existing workflow stays exactly the same — `npm install`, `npm run dev`, `npx create-vite` — but everything runs through Bun under the hood. The only thing you'll notice is speed.

---

## Install

Open PowerShell and run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```

Or, if you cloned the repo:

```powershell
npm run install-wrapper
```

That's it. No other steps.

---

## What happens

- ✅ **Bun is installed automatically** if not already present
- ✅ **Your existing npm is untouched** — we never modify or replace it
- ✅ **All npm commands work exactly as before** — same syntax, same flags
- ✅ **Installs are 10–25x faster** — the only visible difference
- ✅ **No admin privileges required** — uses User-level PATH only

### How it works

bunpm uses a **PATH hijack approach**: it places lightweight wrapper scripts in `~/.bunpm/bin/` and prepends that directory to your User PATH. Windows finds our wrapper first, translates your npm command to the bun equivalent, runs it, and formats the output to look like npm. The original npm binary is never touched — it's just lower priority on PATH.

---

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File scripts/uninstall.ps1
```

Or:

```powershell
npm run uninstall-wrapper
```

This removes the `~/.bunpm` folder and cleans your PATH. Original npm is instantly restored.

---

## Command Mapping

### Commands that use Bun

| npm command | runs as | notes |
|---|---|---|
| `npm install` | `bun install` | Install all deps from package.json |
| `npm install <pkg>` | `bun add <pkg>` | Add a specific package |
| `npm install -D <pkg>` | `bun add -d <pkg>` | Add as dev dependency |
| `npm install -g <pkg>` | `bun add -g <pkg>` | Global install |
| `npm uninstall <pkg>` | `bun remove <pkg>` | Remove a package |
| `npm run <script>` | `bun run <script>` | Run package.json scripts |
| `npm start` | `bun run start` | Shorthand for run start |
| `npm test` | `bun test` | Run tests |
| `npm update` | `bun update` | Update dependencies |
| `npm ci` | `bun install --frozen-lockfile` | Clean install |
| `npm init` | `bun init` | Initialize new project |
| `npm create <X>` | `bun create <X>` | Create from template |
| `npm exec <X>` | `bun x <X>` | Execute package binary |
| `npm link` | `bun link` | Link local package |
| `npm rebuild` | `bun rebuild` | Rebuild native modules |
| `npm list` | `bun pm ls` | List installed packages |
| `npx <X>` | `bunx <X>` | Execute package directly |

### Commands that fall back to original npm

These commands use the original npm since Bun doesn't support them:

`publish` · `login` · `logout` · `whoami` · `audit` · `pack` · `fund` · `deprecate` · `dist-tag` · `access` · `team` · `profile` · `org` · `token` · `hook` · `adduser`

### Flag Translation

| npm flag | bun flag |
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

## Architecture

```
~/.bunpm/
├── bin/
│   ├── npm.cmd          ← Windows CMD launcher
│   ├── npm              ← Unix-style shebang (PowerShell/Git Bash)
│   ├── npx.cmd          ← Windows CMD launcher
│   └── npx              ← Unix-style shebang
├── lib/
│   ├── wrapper.js       ← Main entry point
│   ├── mapper.js        ← npm → bun command translation
│   ├── formatter.js     ← bun output → npm style output
│   └── detector.js      ← Detects bun path, version, system info
└── package.json
```

**Flow:** `npm install express` → `npm.cmd` → `node wrapper.js npm install express` → mapper translates to `bun add express` → bun runs → formatter rewrites output → user sees npm-style output.

---

## Requirements

- **Windows 10 / 11**
- **Node.js** ≥ 16 (already installed if you use npm)
- **Bun** (auto-installed if missing)

---

## Shell Compatibility

| Shell | Status |
|---|---|
| CMD | ✅ Full support via `.cmd` files |
| PowerShell | ✅ Full support |
| Windows Terminal | ✅ Full support |
| Git Bash | ✅ Supported via shebang scripts |

---

## Troubleshooting

### `npm --version` still shows original npm version
Restart your terminal. The PATH change requires a new session to take effect.

### `where npm` shows original npm first
The install script may not have prepended correctly. Check your User PATH:
```powershell
[Environment]::GetEnvironmentVariable("PATH", "User")
```
Ensure `%USERPROFILE%\.bunpm\bin` is at the **beginning** of the PATH string.

### Bun crashes on a specific command
bunpm automatically falls back to original npm if bun encounters an internal error. If a command consistently fails, check if it's in the fallback list or report it as an issue.

### Need to bypass bunpm temporarily
Use the full path to original npm:
```powershell
& "C:\Program Files\nodejs\npm.cmd" install express
```

---

## Testing Checklist

After install, these must all work:

- [ ] `npm --version` → prints npm version (not bun version)
- [ ] `npm install express` → installs via bun, output looks like npm
- [ ] `npm install` → installs all deps from package.json via bun
- [ ] `npm run dev` → runs dev script via bun
- [ ] `npx create-vite` → runs via bunx
- [ ] `npm uninstall express` → removes via bun
- [ ] `npm publish` → falls back to original npm
- [ ] Uninstall script → `where npm` shows only original npm again
- [ ] `npm ci` → runs `bun install --frozen-lockfile`
- [ ] `npm install -D typescript` → runs `bun add -d typescript`
- [ ] `npm install -g serve` → runs `bun add -g serve`

---

## License

MIT
