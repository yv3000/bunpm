const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const detector = require('./detector');
const { mapCommand, validateArgs } = require('./mapper');
const { formatOutput } = require('./formatter');

function spawnCommand(binary, args, options = {}) {
  validateArgs(args);
  if (
    typeof binary !== 'string' ||
    !path.isAbsolute(binary) ||
    binary.includes('\0')
  )
    throw new TypeError('Expected an absolute executable path');
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(binary)) {
    const dir = path.dirname(binary);
    const name = path.basename(binary, path.extname(binary)).toLowerCase();
    const cli = {
      npm: 'npm/bin/npm-cli.js',
      npx: 'npm/bin/npx-cli.js',
      yarn: 'yarn/bin/yarn.js',
      pnpm: 'pnpm/bin/pnpm.cjs',
    }[name];
    const entry = cli && path.join(dir, 'node_modules', cli);
    if (entry && fs.existsSync(entry)) {
      args = [entry, ...args];
      binary = process.execPath;
    } else {
      // Generic batch shims require cmd.exe. Fail closed on shell syntax rather
      // than guessing escape rules through a potentially nested batch script.
      if ([binary, ...args].some((value) => /["%!*^&|<>\r\n()]/.test(value)))
        throw new Error(
          'Unsafe batch argument; use the original Node CLI entrypoint instead',
        );
      const command = `"${[binary, ...args].map((value) => `"${value}"`).join(' ')}"`;
      return cp.spawnSync(
        path.join(
          process.env.SystemRoot || process.env.WINDIR,
          'System32',
          'cmd.exe',
        ),
        ['/d', '/v:off', '/s', '/c', command],
        { ...options, shell: false, windowsVerbatimArguments: true },
      );
    }
  }
  return cp.spawnSync(binary, args, { ...options, shell: false });
}

function exitCode(result) {
  if (result.error) {
    console.error(`bunpm error: ${result.error.message}`);
    return 1;
  }
  if (result.signal) return 128 + (os.constants.signals[result.signal] || 1);
  return result.status ?? 1;
}

function main(invokedAs = process.argv[2], args = process.argv.slice(3)) {
  try {
    const mapped = mapCommand(invokedAs, args);
    const bun = mapped.fallbackTo ? null : detector.getBunPath();
    const original = () => {
      const binary = detector.locateBinary(invokedAs);
      if (!binary) {
        console.error(
          `bunpm error: Original ${invokedAs} not found; install it for this command or install Bun for supported commands.`,
        );
        return 1;
      }
      return exitCode(spawnCommand(binary, args, { stdio: 'inherit' }));
    };
    if (mapped.fallbackTo || !bun) return original();
    const execArgs = mapped.useBunx ? ['x', ...mapped.bunArgs] : mapped.bunArgs;
    const interactive =
      mapped.useBunx || ['run', 'create'].includes(execArgs[0]);
    // ponytail: sync formatted output is capped at 16 MiB; stream it if real
    // install output reaches this ceiling. Never retry a possibly completed run.
    const result = spawnCommand(bun, execArgs, {
      stdio: interactive ? 'inherit' : ['inherit', 'pipe', 'pipe'],
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, npm_execpath: bun },
    });
    // These failures happen before execution; retrying cannot duplicate effects.
    if (result.error && ['ENOENT', 'EACCES'].includes(result.error.code))
      return original();
    const context = { invokedAs, subcommand: execArgs[0] };
    for (const stream of ['stdout', 'stderr']) {
      if (result[stream])
        process[stream].write(formatOutput(result[stream], context));
    }
    return exitCode(result);
  } catch (error) {
    console.error(`bunpm error: ${error.message}`);
    return 1;
  }
}

module.exports = { main, spawnCommand, exitCode };
if (require.main === module) process.exitCode = main();
