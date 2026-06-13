// lib/wrapper.js
// Main entry point — ties detector, mapper, and formatter together.
// Intercepts npm/npx invocations, translates to bun, formats output.
// Only uses Node.js built-ins — no external dependencies.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const detector = require('./detector');
const { mapCommand } = require('./mapper');
const { formatLine } = require('./formatter');

function main() {
  try {
    // Args layout: [node, wrapper.js, 'npm'|'npx', ...userArgs]
    const invokedAs = process.argv[2]; // 'npm' or 'npx'
    const userArgs = process.argv.slice(3);

    // Detect bun
    const bunPath = detector.getBunPath();

    // Map the npm/npx command to bun equivalent
    const mapped = mapCommand(invokedAs, userArgs);

    // ── Fallback: use original npm if needed or bun not found ───────────────
    if (mapped.fallbackToNpm || !bunPath) {
      const originalBinary = findOriginal(invokedAs || 'npm');
      if (originalBinary) {
        const result = spawnSync(originalBinary, mapped.fallbackArgs || userArgs, {
          stdio: 'inherit',
          shell: false,
          env: process.env,
          cwd: process.cwd(),
        });
        process.exit(result.status || 0);
      } else {
        console.error(`npm error: Could not find original ${invokedAs || 'npm'}. Please reinstall Node.js.`);
        process.exit(1);
      }
      return;
    }

    // ── Special case: --version → print fake npm version and exit ───────────
    if (
      userArgs[0] === '--version' ||
      userArgs[0] === '-v' ||
      userArgs[0] === 'version'
    ) {
      console.log('10.8.2');
      process.exit(0);
    }

    // ── Build the actual bun command ────────────────────────────────────────
    let execPath;
    let execArgs;

    if (mapped.useBunx) {
      // npx → bunx
      const bunxPath = detector.getBunxPath() || bunPath;
      // If bunx is just bun, use `bun x` syntax
      if (bunxPath === bunPath) {
        execPath = bunPath;
        execArgs = ['x', ...userArgs];
      } else {
        execPath = bunxPath;
        execArgs = userArgs;
      }
    } else {
      execPath = bunPath;
      execArgs = mapped.bunArgs;
    }

    // Determine subcommand for formatter context
    const subcommand = mapped.bunArgs ? mapped.bunArgs[0] : 'run';
    const context = { subcommand, invokedAs };

    // ── Build bun-aware environment ─────────────────────────────────────────
    const bunVersion = detector.getBunVersion() || '1.0.0';
    const bunEnv = {
      ...process.env,
      npm_config_user_agent: 'bun/' + bunVersion + ' npm/0.0.0 node/' + process.version + ' win32 x64',
      npm_execpath: detector.getBunPath() || process.env.npm_execpath,
    };

    // ── Run bun with output interception ────────────────────────────────────
    const result = spawnSync(execPath, execArgs, {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: false,
      env: bunEnv,
      cwd: process.cwd(),
    });

    // Format and print stdout
    if (result.stdout) {
      const formatted = result.stdout
        .split('\n')
        .map(line => formatLine(line, context))
        .filter(line => line !== null)
        .join('\n');
      if (formatted.trim()) process.stdout.write(formatted + '\n');
    }

    // Format and print stderr
    if (result.stderr) {
      const formatted = result.stderr
        .split('\n')
        .map(line => formatLine(line, context))
        .filter(line => line !== null)
        .join('\n');
      if (formatted.trim()) process.stderr.write(formatted + '\n');
    }

    // ── If bun crashed on an internal error, try fallback to original npm ───
    if (result.status !== 0 && result.error) {
      const originalBinary = findOriginal(invokedAs || 'npm');
      if (originalBinary) {
        console.error('npm warn: Bun encountered an error, falling back to original npm...');
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
    // Last-resort error handler — never show raw stack traces
    console.error(`npm error: An unexpected error occurred.`);
    console.error(`npm error: ${err.message || err}`);

    // Try original npm as ultimate fallback
    try {
      const invokedAs = process.argv[2] || 'npm';
      const userArgs = process.argv.slice(3);
      const originalBinary = findOriginal(invokedAs);
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
      // nothing we can do
    }
    process.exit(1);
  }
}

/**
 * Find the original npm/npx binary on PATH, skipping our .bunpm wrapper directory.
 * Prevents infinite recursion.
 *
 * @param {string} binaryName — 'npm' or 'npx'
 * @returns {string|null} — absolute path to the original binary, or null
 */
function findOriginal(binaryName) {
  const pathEnv = process.env.PATH || '';
  const pathDirs = pathEnv.split(';');

  for (const dir of pathDirs) {
    if (!dir) continue;
    // Skip our own .bunpm directory to avoid calling ourselves
    if (dir.includes('.bunpm')) continue;

    const candidates = [
      path.join(dir, `${binaryName}.cmd`),
      path.join(dir, `${binaryName}.exe`),
      path.join(dir, binaryName),
    ];

    for (const candidate of candidates) {
      try {
        fs.accessSync(candidate);
        return candidate;
      } catch {
        // not found at this path, continue
      }
    }
  }
  return null;
}

main();
