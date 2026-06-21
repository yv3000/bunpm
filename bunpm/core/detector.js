// core/detector.js
// Detects system state: bun/yarn/pnpm binary paths and versions, cross-platform.
// Only uses Node.js built-ins — no external dependencies.

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { detectPlatform, getHomeDir } = require('./platform-detect');

/**
 * Build the platform-correct "locate a binary on PATH" command.
 * @param {string} binaryName
 * @returns {string} the shell command to run, e.g. "where bun" or "which bun"
 */
function buildLocateCommand(binaryName) {
  const platform = detectPlatform();
  if (platform === 'windows') {
    return `where ${binaryName}`;
  }
  return `which ${binaryName}`;
}

/**
 * Generic binary locator. Tries the OS-native locate command first,
 * then falls back to a list of common install-location guesses if
 * the locate command fails (e.g. PATH not yet refreshed in this shell
 * session, which is common right after a fresh install before the
 * user has opened a new terminal).
 *
 * @param {string} binaryName - e.g. 'bun', 'yarn', 'pnpm'
 * @param {string[]} fallbackPaths - absolute paths to check if locate command fails
 * @returns {string|null}
 */
function locateBinary(binaryName, fallbackPaths) {
  try {
    const cmd = buildLocateCommand(binaryName);
    const result = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const firstLine = result.trim().split('\n')[0].trim();
    if (firstLine) return firstLine;
  } catch {
    // locate command failed or binary not found via it — try fallback paths below
  }
  for (const p of fallbackPaths) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {
      // not found or not executable at this path, continue
    }
  }
  return null;
}

/**
 * Find the bun executable path, cross-platform.
 * Windows: ~/.bun/bin/bun.exe
 * macOS/Linux: ~/.bun/bin/bun
 *
 * @returns {string|null}
 */
function getBunPath() {
  const platform = detectPlatform();
  const home = getHomeDir();
  const fallbackPaths = platform === 'windows'
    ? [
        path.join(home, '.bun', 'bin', 'bun.exe'),
        path.join(home, '.bun', 'bin', 'bun'),
      ]
    : [
        path.join(home, '.bun', 'bin', 'bun'),
        '/usr/local/bin/bun',
        '/opt/homebrew/bin/bun',
      ];
  return locateBinary('bun', fallbackPaths);
}

/**
 * Find the bunx executable path. bunx usually lives next to bun.
 * If a dedicated bunx binary doesn't exist, return the bun path itself —
 * callers should use `bun x ...` syntax in that case rather than calling
 * a nonexistent bunx directly.
 *
 * @returns {string|null}
 */
function getBunxPath() {
  const bunPath = getBunPath();
  if (!bunPath) return null;
  const dir = path.dirname(bunPath);
  const platform = detectPlatform();
  const bunxName = platform === 'windows' ? 'bunx.exe' : 'bunx';
  const bunxPath = path.join(dir, bunxName);
  try {
    fs.accessSync(bunxPath, fs.constants.X_OK);
    return bunxPath;
  } catch {
    return bunPath;
  }
}

/**
 * Get the installed bun version string.
 * @returns {string|null}
 */
function getBunVersion() {
  try {
    const bunPath = getBunPath();
    if (!bunPath) return null;
    const quoted = bunPath.includes(' ') ? `"${bunPath}"` : bunPath;
    return execSync(`${quoted} --version`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

/**
 * NEW IN V2: Find the original yarn executable path on this system,
 * if yarn is installed at all. Used so bunpm can fall back to it for
 * yarn subcommands bun doesn't support, and so bunpm can detect "is
 * yarn even present on this machine" before deciding to install the
 * yarn launcher shim.
 *
 * @returns {string|null}
 */
function getYarnPath() {
  const platform = detectPlatform();
  const fallbackPaths = platform === 'windows'
    ? ['C:\\Program Files\\nodejs\\yarn.cmd', 'C:\\Program Files (x86)\\nodejs\\yarn.cmd']
    : ['/usr/local/bin/yarn', '/opt/homebrew/bin/yarn', '/usr/bin/yarn'];
  return locateBinary('yarn', fallbackPaths);
}

/**
 * NEW IN V2: Find the original pnpm executable path on this system.
 * Same purpose as getYarnPath but for pnpm.
 *
 * @returns {string|null}
 */
function getPnpmPath() {
  const platform = detectPlatform();
  const fallbackPaths = platform === 'windows'
    ? [path.join(getHomeDir(), 'AppData', 'Local', 'pnpm', 'pnpm.exe')]
    : ['/usr/local/bin/pnpm', '/opt/homebrew/bin/pnpm', path.join(getHomeDir(), '.local', 'share', 'pnpm', 'pnpm')];
  return locateBinary('pnpm', fallbackPaths);
}

/**
 * Check if bun is available on this system at all.
 * @returns {boolean}
 */
function isBunAvailable() {
  return getBunPath() !== null;
}

module.exports = {
  getBunPath,
  getBunxPath,
  getBunVersion,
  getYarnPath,
  getPnpmPath,
  isBunAvailable,
  buildLocateCommand,
  locateBinary,
};
