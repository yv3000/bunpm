const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const detector = require('./detector');
const { mapCommand, validateArgs } = require('./mapper');
const { formatStream } = require('./formatter');

/**
 * @typedef {import('node:child_process').SpawnSyncReturns<string | Buffer>} SpawnResult
 */

/**
 * Validate a spawn and resolve what to execute: an absolute executable with an
 * argument array (`shell: false`). A generic Windows `.cmd`/`.bat` shim
 * instead runs through an explicit cmd.exe invocation and rejects
 * shell-sensitive arguments. Shared by the sync and streaming spawns so both
 * enforce the same checks.
 *
 * @template {object} T
 * @param {string} binary
 * @param {string[]} args
 * @param {T} options
 * @returns {[string, string[], T & { shell: false, windowsVerbatimArguments?: boolean }]}
 */
function resolveSpawn(binary, args, options) {
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
    const cli = /** @type {Record<string, string>} */ ({
      npm: 'npm/bin/npm-cli.js',
      npx: 'npm/bin/npx-cli.js',
      yarn: 'yarn/bin/yarn.js',
      pnpm: 'pnpm/bin/pnpm.cjs',
    })[name];
    const entry = cli && path.join(dir, 'node_modules', cli);
    if (entry && fs.existsSync(entry)) {
      args = [entry, ...args];
      binary = process.execPath;
    } else {
      // Generic batch shims require cmd.exe. Fail closed on shell syntax rather
      // than guessing escape rules through a potentially nested batch script.
      if (
        /["%!^&|<>\r\n]/.test(binary) ||
        args.some((value) => /["%!^&|<>\r\n()]/.test(value))
      )
        throw new Error(
          'Unsafe batch argument; use the original Node CLI entrypoint instead',
        );
      const systemRoot = process.env.SystemRoot || process.env.WINDIR;
      if (!systemRoot)
        throw new Error('Cannot locate cmd.exe: SystemRoot is not set');
      const command = `"${[binary, ...args].map((value) => `"${value}"`).join(' ')}"`;
      return [
        path.join(systemRoot, 'System32', 'cmd.exe'),
        ['/d', '/v:off', '/s', '/c', command],
        { ...options, shell: false, windowsVerbatimArguments: true },
      ];
    }
  }
  return [binary, args, { ...options, shell: false }];
}

/**
 * Spawn synchronously after the resolveSpawn checks.
 *
 * @param {string} binary
 * @param {string[]} args
 * @param {import('node:child_process').SpawnSyncOptions} [options]
 * @returns {SpawnResult}
 */
function spawnCommand(binary, args, options = {}) {
  const [file, argv, resolved] = resolveSpawn(binary, args, options);
  return cp.spawnSync(file, argv, resolved);
}

// Every bunpm component reports failures on stderr as
// `bunpm: <component>: <actionable message>` so users can tell bunpm's own
// diagnostics apart from the child manager's output. Child exit codes and the
// underlying cause text are preserved unchanged. With BUNPM_DEBUG=1 the same
// failure is also written as one JSON line for tools that embed bunpm.
/**
 * @param {string} component
 * @param {string} message
 * @param {string} [code] error code such as ENOENT, when known
 */
function diagnose(component, message, code) {
  console.error(`bunpm: ${component}: ${message}`);
  if (process.env.BUNPM_DEBUG === '1')
    console.error(
      JSON.stringify({
        level: 'error',
        component,
        message,
        ...(code && { code }),
      }),
    );
}

/**
 * @param {Pick<SpawnResult, 'error' | 'signal' | 'status'>} result
 * @returns {number}
 */
function exitCode(result) {
  if (result.error) {
    const { message, code } = /** @type {NodeJS.ErrnoException} */ (
      result.error
    );
    diagnose('exec', message, code);
    return 1;
  }
  if (result.signal) return 128 + (os.constants.signals[result.signal] || 1);
  return result.status ?? 1;
}

/**
 * ENOENT/EACCES mean the executable never started, so retrying with the
 * original manager cannot repeat any effect.
 *
 * @param {Error | undefined} error
 */
const notStarted = (error) =>
  ['ENOENT', 'EACCES'].includes(
    /** @type {NodeJS.ErrnoException | undefined} */ (error)?.code ?? '',
  );

/**
 * Run one invocation and resolve to its exit code. Never rejects.
 *
 * @param {string} [invokedAs]
 * @param {string[]} [args]
 * @returns {Promise<number>}
 */
async function main(invokedAs = process.argv[2], args = process.argv.slice(3)) {
  try {
    const mapped = mapCommand(invokedAs, args);
    const bun = mapped.fallbackTo ? null : detector.getBunPath();
    const original = () => {
      const binary = detector.locateBinary(invokedAs);
      if (!binary) {
        diagnose(
          'detector',
          `original ${invokedAs} not found; install ${invokedAs} for this command, or install Bun for supported commands.`,
        );
        return 1;
      }
      return exitCode(spawnCommand(binary, args, { stdio: 'inherit' }));
    };
    if (mapped.fallbackTo || !bun) return original();
    const execArgs = mapped.useBunx ? ['x', ...mapped.bunArgs] : mapped.bunArgs;
    const interactive =
      mapped.useBunx || ['run', 'create'].includes(execArgs[0]);
    const env = { ...process.env, npm_execpath: bun };
    if (interactive) {
      const result = spawnCommand(bun, execArgs, { stdio: 'inherit', env });
      return notStarted(result.error) ? original() : exitCode(result);
    }
    // Stream formatted lines while Bun runs: no output-size ceiling can kill
    // an install half-way. ponytail: stdout backpressure is not applied; a
    // stalled terminal buffers in memory instead of pausing Bun.
    /** @type {import('node:child_process').SpawnOptions} */
    const piped = { stdio: ['inherit', 'pipe', 'pipe'], env };
    const [file, argv, options] = resolveSpawn(bun, execArgs, piped);
    const context = { invokedAs, subcommand: execArgs[0] };
    /** @type {Pick<SpawnResult, 'error' | 'signal' | 'status'>} */
    const result = await new Promise((resolve) => {
      const child =
        /** @type {import('node:child_process').ChildProcessByStdio<null, import('node:stream').Readable, import('node:stream').Readable>} */ (
          /** @type {unknown} */ (cp.spawn(file, argv, options))
        );
      let started = false;
      /** @type {Error | undefined} */
      let failure;
      child.on('spawn', () => (started = true));
      // An error after 'spawn' must never trigger a second manager.
      child.on('error', (error) =>
        started
          ? (failure = error)
          : resolve({ error, status: null, signal: null }),
      );
      formatStream(child.stdout, (text) => process.stdout.write(text), context);
      formatStream(child.stderr, (text) => process.stderr.write(text), context);
      // 'close' fires after exit and after both pipes ended (and were written).
      child.on('close', (status, signal) =>
        resolve({ error: failure, status, signal }),
      );
    });
    // started stays false only when 'error' resolved first.
    if (notStarted(result.error) && result.status === null && !result.signal)
      return original();
    return exitCode(result);
  } catch (error) {
    diagnose('wrapper', /** @type {Error} */ (error).message);
    return 1;
  }
}

module.exports = { main, spawnCommand, exitCode, diagnose };
if (require.main === module)
  main().then((code) => {
    process.exitCode = code;
  });
