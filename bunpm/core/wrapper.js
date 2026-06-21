// core/wrapper.js
// Main entry point — ties detector, mapper, and formatter together.
// Intercepts npm/npx/yarn/pnpm invocations, translates to bun, formats output.
// Only uses Node.js built-ins — no external dependencies.
// This file is OS-agnostic — identical behavior on Windows, macOS, Linux.
// Platform-specific bin/ launcher files (npm.cmd on Windows, npm shell
// script on macOS/Linux) all eventually call into THIS file with the
// same argv layout: [node, wrapper.js, invokedAs, ...userArgs]

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const detector = require('./detector');
const { mapCommand } = require('./mapper');
const { formatLine } = require('./formatter');
const { detectPlatform } = require('./platform-detect');

function main() {
  try {
    const invokedAs = process.argv[2]; // 'npm', 'npx', 'yarn', or 'pnpm'
    const userArgs = process.argv.slice(3);
    const platform = detectPlatform();

    const bunPath = detector.getBunPath();
    const mapped = mapCommand(invokedAs, userArgs);

    // ── Fallback: bun not found, or command explicitly not bun-able ────────
    if (mapped.fallbackTo || !bunPath) {
      const fallbackBinaryName = mapped.fallbackTo || invokedAs;
      const originalBinary = findOriginal(fallbackBinaryName, platform);
      if (originalBinary) {
        const result = spawnSync(originalBinary, mapped.fallbackArgs || userArgs, {
          stdio: 'inherit',
          shell: false,
          env: process.env,
          cwd: process.cwd(),
        });
        process.exit(result.status || 0);
      } else {
        // No bun AND no original binary found either — this is the one
        // genuinely unrecoverable case. Print a clear, specific error
        // rather than a generic crash.
        if (!bunPath) {
          console.error(`${invokedAs} error: Bun is required but was not found, and the original ${fallbackBinaryName} binary could not be located either.`);
          console.error(`${invokedAs} error: Please install Bun from https://bun.sh, or reinstall ${fallbackBinaryName}.`);
        } else {
          console.error(`${invokedAs} error: This command ("${(mapped.fallbackArgs || userArgs).join(' ')}") is not supported by Bun, and the original ${fallbackBinaryName} binary could not be located on this system.`);
          console.error(`${invokedAs} error: Please install ${fallbackBinaryName} normally to use this specific command.`);
        }
        process.exit(1);
      }
      return;
    }

    // ── Special case: --version → print fake version matching the invoking tool ──
    if (userArgs[0] === '--version' || userArgs[0] === '-v' || userArgs[0] === 'version') {
      const fakeVersions = { npm: '10.8.2', yarn: '1.22.22', pnpm: '9.12.0' };
      console.log(fakeVersions[invokedAs] || '1.0.0');
      process.exit(0);
    }

    // ── Build the actual bun/bunx command to execute ───────────────────────
    let execPath;
    let execArgs;

    if (mapped.useBunx) {
      const bunxPath = detector.getBunxPath() || bunPath;
      if (bunxPath === bunPath) {
        execPath = bunPath;
        execArgs = ['x', ...(mapped.bunArgs || userArgs)];
      } else {
        execPath = bunxPath;
        execArgs = mapped.bunArgs || userArgs;
      }
    } else {
      execPath = bunPath;
      execArgs = mapped.bunArgs;
    }

    const subcommand = mapped.bunArgs ? mapped.bunArgs[0] : 'run';
    const context = { subcommand, invokedAs };

    const bunVersion = detector.getBunVersion() || '1.0.0';
    const platformTag = platform === 'windows' ? 'win32 x64' : (platform === 'macos' ? 'darwin x64' : 'linux x64');
    const bunEnv = {
      ...process.env,
      npm_config_user_agent: 'bun/' + bunVersion + ' npm/0.0.0 node/' + process.version + ' ' + platformTag,
      npm_execpath: detector.getBunPath() || process.env.npm_execpath,
    };

    // ── npx/bunx/dlx/exec: stdio inherit so interactive prompts work ───────
    // This covers npx create-vite, yarn dlx create-vite, pnpm dlx create-vite —
    // ALL of these route through this single branch since mapper.js already
    // normalized them all to useBunx:true regardless of which package
    // manager's vocabulary the user originally typed.
    if (mapped.useBunx) {
      const result = spawnSync(execPath, execArgs, {
        stdio: 'inherit',
        shell: false,
        env: bunEnv,
        cwd: process.cwd(),
      });
      process.exit(result.status || 0);
    }

    // ── npm/yarn/pnpm via bun: pipe output for reformatting ────────────────
    const result = spawnSync(execPath, execArgs, {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: false,
      env: bunEnv,
      cwd: process.cwd(),
    });

    if (result.stdout) {
      const formatted = result.stdout
        .split('\n')
        .map(line => formatLine(line, context))
        .filter(line => line !== null)
        .join('\n');
      if (formatted.trim()) process.stdout.write(formatted + '\n');
    }
    if (result.stderr) {
      const formatted = result.stderr
        .split('\n')
        .map(line => formatLine(line, context))
        .filter(line => line !== null)
        .join('\n');
      if (formatted.trim()) process.stderr.write(formatted + '\n');
    }

    // ── If bun crashed on an internal error, try fallback to original binary ──
    if (result.status !== 0 && result.error) {
      const originalBinary = findOriginal(invokedAs, platform);
      if (originalBinary) {
        console.error(`${invokedAs} warn: Bun encountered an error, falling back to original ${invokedAs}...`);
        const fallbackResult = spawnSync(originalBinary, userArgs, {
          stdio: 'inherit',
          shell: false,
          env: process.env,
          cwd: process.cwd(),
        });
        process.exit(fallbackResult.status || 0);
        return;
      }
    }

    process.exit(result.status || 0);
  } catch (err) {
    console.error(`bunpm error: An unexpected error occurred.`);
    console.error(`bunpm error: ${err.message || err}`);
    try {
      const invokedAs = process.argv[2] || 'npm';
      const userArgs = process.argv.slice(3);
      const platform = detectPlatform();
      const originalBinary = findOriginal(invokedAs, platform);
      if (originalBinary) {
        const result = spawnSync(originalBinary, userArgs, {
          stdio: 'inherit',
          shell: false,
          env: process.env,
          cwd: process.cwd(),
        });
        process.exit(result.status || 0);
      }
    } catch {
      // nothing more we can do
    }
    process.exit(1);
  }
}

/**
 * Find the original binary (npm, npx, yarn, or pnpm) on PATH, skipping
 * our own .bunpm directory entirely to prevent infinite recursion
 * (calling our own wrapper again instead of the real binary).
 *
 * Cross-platform: on Windows, candidate filenames include .cmd and .exe
 * extensions; on macOS/Linux, the bare binary name is the only candidate
 * since Unix executables don't carry extensions.
 *
 * @param {string} binaryName
 * @param {'windows'|'macos'|'linux'} platform
 * @returns {string|null}
 */
function findOriginal(binaryName, platform) {
  const pathEnv = process.env.PATH || '';
  const separator = platform === 'windows' ? ';' : ':';
  const pathDirs = pathEnv.split(separator);

  for (const dir of pathDirs) {
    if (!dir) continue;
    if (dir.includes('.bunpm')) continue;

    const candidates = platform === 'windows'
      ? [
          path.join(dir, `${binaryName}.cmd`),
          path.join(dir, `${binaryName}.exe`),
          path.join(dir, binaryName),
        ]
      : [
          path.join(dir, binaryName),
        ];

    for (const candidate of candidates) {
      try {
        fs.accessSync(candidate, platform === 'windows' ? undefined : fs.constants.X_OK);
        return candidate;
      } catch {
        // not found at this candidate, continue
      }
    }
  }
  return null;
}

main();
