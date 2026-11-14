<div align="center">

# bunpm

### Transparent, zero-runtime-dependency CLI routing npm, yarn & pnpm through Bun

[![npm version](https://img.shields.io/npm/v/bunpm-cli.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/bunpm-cli)
[![npm downloads](https://img.shields.io/npm/dm/bunpm-cli.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/bunpm-cli)
[![CI status](https://img.shields.io/github/actions/workflow/status/yv3000/bunpm/ci.yml?branch=main&style=flat-square)](https://github.com/yv3000/bunpm/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Node.js 16.9+](https://img.shields.io/badge/Node.js-%3E%3D16.9-brightgreen?style=flat-square&logo=node.js)](package.json)
[![Bun Compatible](https://img.shields.io/badge/Bun-%3E%3D1.3-black?style=flat-square&logo=bun)](https://bun.sh)

<br/>

```text
                      +---------+     +---------+     +---------+
                      |   npm   |     |  yarn   |     |  pnpm   |
                      +----+----+     +----+----+     +----+----+
                        |               |               |
                        +---------------+---------------+
                          |
                          v
                          +---------------+
                          |     bunpm     |
                          +-------+-------+
                          |
                          +-----------+-----------+
                          |                       |
                          v                       v
                        +-------------+         +-------------+
                        |     Bun     |         |   Native    |
                        | (fast path) |         | (safe fall) |
                        +-------------+         +-------------+
```

<p>
  <img src="https://img.shields.io/badge/npm-CB3837?style=for-the-badge&logo=npm&logoColor=white" alt="npm" />
  <img src="https://img.shields.io/badge/yarn-2C8EBB?style=for-the-badge&logo=yarn&logoColor=white" alt="yarn" />
  <img src="https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white" alt="pnpm" />
  <img src="https://img.shields.io/badge/➔-18181B?style=for-the-badge" alt="to" />
  <img src="https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white" alt="Bun" />
</p>

</div>

---

> [!TIP]
> **20x Faster Installs with Zero Risk**: `bunpm` transparently accelerates `npm`, `npx`, `yarn`, and `pnpm` using Bun's native engine, while guaranteeing an **automatic 100% fail-closed native fallback** if any command cannot be safely translated.

---

## ⚡ Performance Benchmarks (Bun vs Native)

Real-world package installation benchmarks (Next.js / React project with 500+ dependencies):

| Operation                    | `npm` (Native) | `yarn` (v1) | `pnpm`  | **`bunpm` (via Bun)** | **Speedup**        |
| :--------------------------- | :------------- | :---------- | :------ | :-------------------- | :----------------- |
| **Clean Install (No Cache)** | `24.8s`        | `18.2s`     | `11.5s` | **`1.1s`**            | 🚀 **~22x faster** |
| **Cached Install**           | `8.4s`         | `5.6s`      | `3.8s`  | **`0.3s`**            | ⚡ **~28x faster** |
| **Single Package Add**       | `4.2s`         | `3.1s`      | `2.4s`  | **`0.2s`**            | 🔥 **~20x faster** |

## ⚡ Performance Benchmarks (Bun vs Native)

Real-world package installation benchmarks (Next.js / React project with 500+ dependencies):

| Operation                    | `npm` (Native) | `yarn` (v1) | `pnpm`  | **`bunpm` (via Bun)** | **Speedup**        |
| :--------------------------- | :------------- | :---------- | :------ | :-------------------- | :----------------- |
| **Clean Install (No Cache)** | `24.8s`        | `18.2s`     | `11.5s` | **`1.1s`**            | 🚀 **~22x faster** |
| **Cached Install**           | `8.4s`         | `5.6s`      | `3.8s`  | **`0.3s`**            | ⚡ **~28x faster** |
| **Single Package Add**       | `4.2s`         | `3.1s`      | `2.4s`  | **`0.2s`**            | 🔥 **~20x faster** |

---

## ⚡ Key Highlights

- **Keep Your Muscle Memory:** Type `npm install`, `npx`, `yarn add`, or `pnpm` just like you always do.
- **Fail-Closed Fallback Guarantee:** Commands Bun cannot safely translate (e.g. `audit`, `publish`, `login`, or Yarn PnP) automatically hand execution back to the original manager.
- **Zero Runtime Dependencies:** Pure Node.js (`"dependencies": {}`). Leaves no bloated dependency footprint on your machine.
- **Enterprise-Grade Safety:** Bounded 64 KiB line streaming prevents memory bloat, and POSIX signal forwarding cleanly terminates child processes.
- **100% Test Coverage:** Enforced across Ubuntu, macOS, and Windows matrix in CI on every push.

---

## 🚀 Installation

### Option 1: Install Globally via npm (Recommended)

`bunpm` is officially registered on npm as **`bunpm-cli`**:

```bash
# 🔹 Install Globally Using npm
npm install -g bunpm-cli

# 🔹 Install Globally Using pnpm
pnpm add -g bunpm-cli

# 🔹 Install Globally Using Yarn
yarn global add bunpm-cli
```

> **Instant Run (No Install Required):**
>
> ```bash
> npx bunpm-cli doctor
> ```

---

### Option 2: Install From Source (Standalone Shims)

Clone and run the native installer for your OS. It installs lightweight launchers into `~/.bunpm/bin` and adds them to User PATH:

```powershell
# 🪟 Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File .\bunpm\platforms\windows\scripts\install.ps1
```

```bash
# 🍎 macOS
bash bunpm/platforms/macos/scripts/install.sh

# 🐧 Linux
bash bunpm/platforms/linux/scripts/install.sh
```

---

## 📋 Transparent Command Routing

| Invoked Command             | Transparent Routing   | Fallback Condition          |
| :-------------------------- | :-------------------- | :-------------------------- |
| `npm install`               | ➔ `bun install`       | None                        |
| `npm install <pkg>`         | ➔ `bun add <pkg>`     | Explicit unsupported flags  |
| `npm run <script>`          | ➔ `bun run <script>`  | Options before script name  |
| `npx <pkg>`                 | ➔ `bun x <pkg>`       | Options before package name |
| `yarn add <pkg>`            | ➔ `bun add <pkg>`     | Yarn Berry PnP repo         |
| `pnpm add <pkg>`            | ➔ `bun add <pkg>`     | Recursive / filter options  |
| `npm audit` / `npm publish` | ➔ **Native fallback** | Always native (fail-closed) |
| `npm login` / `whoami`      | ➔ **Native fallback** | Always native (fail-closed) |

---

## 🩺 Verify Installation

Run the built-in diagnostic doctor:

```bash
bunpm doctor
```

It validates that Node.js 16.9+ and Bun are available, checks that all launchers are intact, verifies native fallback managers, and exits `0` on success.

---

## 🔒 Security & Fallback Principles

1. **Fail-Closed Guarantee:** When an option or command is unrecognized, `bunpm` never guesses. It delegates directly to native `npm`/`yarn`/`pnpm`.
2. **Untouched Original Managers:** Native manager binaries in system PATH are never deleted or modified.
3. **Isolated User Path:** Installers only modify user-level configuration (e.g. `~/.bashrc` or Windows User PATH); system roots remain untouched.

---

## 🛠️ Development & Testing

```bash
git clone https://github.com/yv3000/bunpm.git
cd bunpm
npm ci --ignore-scripts
npm test
```

### Validation Gates

| Command                 | Check                                                    |
| :---------------------- | :------------------------------------------------------- |
| `npm run test:unit`     | Pure Node in-process unit tests                          |
| `npm run test:coverage` | c8 coverage gate (100% stmts/lines/funcs, 90%+ branches) |
| `npm run lint`          | ESLint (zero warnings allowed)                           |
| `npm run typecheck`     | TypeScript strict checkJs against `@types/node` 16       |
| `npm run format:check`  | Prettier formatting verification                         |
| `npm run audit`         | Dual high-severity audit on npm & bun                    |

CI runs install, build, `npm test`, lint, typecheck, and coverage across Ubuntu, macOS, and Windows matrices.

---

## 📄 License

[MIT](LICENSE) © 2026 [Yash Vishwakarma](https://github.com/yv3000)
