const fs = require('node:fs');
const path = require('node:path');
const detector = require('./detector');
const { log } = require('./log');

const MIN_NODE = [16, 9];
const LAUNCHERS = ['npm', 'npx', 'yarn', 'pnpm'];

/**
 * Where this copy's launchers live: `~/.bunpm/bin` when installed, the
 * platform folder when run from a checkout.
 */
function launcherDir() {
  const installed = path.join(__dirname, '..', 'bin');
  if (fs.existsSync(installed)) return installed;
  /** @type {Record<string, string>} */
  const os = { win32: 'windows', darwin: 'macos' };
  const platform = os[process.platform] ?? 'linux';
  return path.join(__dirname, '..', 'platforms', platform, 'bin');
}

/**
 * `bunpm doctor`: check what translated and fallback commands need. Prints
 * one line per check; failures go to stderr as `bunpm: doctor: ...`.
 *
 * @param {{
 *   spawn: (binary: string, args: string[], options: object) => { status: number | null, stdout?: string | Buffer, error?: Error },
 *   nodeVersion?: string,
 *   binDir?: string,
 * }} options
 * @returns {number} 0 when healthy, 1 otherwise
 */
function doctor({
  spawn,
  nodeVersion = process.versions.node,
  binDir = launcherDir(),
}) {
  let healthy = true;
  /** @param {string} message */
  const fail = (message) => {
    healthy = false;
    log('doctor', message);
  };
  const [major, minor] = nodeVersion.split('.').map(Number);
  if (major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]))
    console.log(`ok   node ${nodeVersion}`);
  else
    fail(
      `node ${nodeVersion} is older than ${MIN_NODE.join('.')}; upgrade Node.js.`,
    );

  const bun = detector.getBunPath();
  if (!bun)
    fail(
      'bun not found on PATH or in ~/.bun/bin; install it from https://bun.sh.',
    );
  else {
    const result = spawn(bun, ['--version'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    if (result.status === 0)
      console.log(`ok   bun ${String(result.stdout).trim()} (${bun})`);
    else
      fail(
        `${bun} --version failed (${result.error?.message ?? `exit ${result.status}`}); repair your Bun installation.`,
      );
  }

  const windows = process.platform === 'win32';
  const missing = LAUNCHERS.flatMap((name) =>
    windows ? [name, `${name}.cmd`] : [name],
  ).filter((name) => !fs.existsSync(path.join(binDir, name)));
  if (missing.length)
    fail(
      `launchers missing from ${binDir}: ${missing.join(', ')}; reinstall bunpm.`,
    );
  else console.log(`ok   launchers in ${binDir}`);

  // Original managers are optional: only fallback commands need them.
  for (const name of ['npm', 'yarn', 'pnpm']) {
    const found = detector.locateBinary(name);
    console.log(
      found
        ? `ok   ${name} ${found}`
        : `info ${name} not found; ${name} commands that fall back will fail.`,
    );
  }
  return healthy ? 0 : 1;
}

module.exports = { doctor };
