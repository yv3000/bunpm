// lib/detector.js
// Detects system state: bun path, bunx path, bun version.
// Only uses Node.js built-ins — no external dependencies.

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Find the bun executable path.
 * First tries `where bun`, then checks common install locations.
 * @returns {string|null} Absolute path to bun executable, or null if not found.
 */
function getBunPath() {
  try {
    const result = execSync('where bun', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return result.trim().split('\n')[0].trim();
  } catch {
    // `where bun` failed — try common install locations
    const commonPaths = [
      path.join(process.env.USERPROFILE || '', '.bun', 'bin', 'bun.exe'),
      path.join(process.env.USERPROFILE || '', '.bun', 'bin', 'bun'),
    ];
    for (const p of commonPaths) {
      try {
        fs.accessSync(p);
        return p;
      } catch {
        // not found at this path, continue
      }
    }
    return null;
  }
}

/**
 * Find the bunx executable path.
 * bunx is usually in the same directory as bun.
 * If bunx.exe doesn't exist, returns bun path (bun x ... works too).
 * @returns {string|null} Absolute path to bunx executable, or null if bun not found.
 */
function getBunxPath() {
  const bunPath = getBunPath();
  if (!bunPath) return null;
  const dir = path.dirname(bunPath);
  const bunxPath = path.join(dir, 'bunx.exe');
  try {
    fs.accessSync(bunxPath);
    return bunxPath;
  } catch {
    // bunx.exe not found — bun can be used as `bun x` instead
    return bunPath;
  }
}

/**
 * Get the installed bun version string.
 * @returns {string|null} Version string (e.g. "1.1.38"), or null if unavailable.
 */
function getBunVersion() {
  try {
    const bunPath = getBunPath();
    if (!bunPath) return null;
    return execSync(`"${bunPath}" --version`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

/**
 * Check if bun is available on this system.
 * @returns {boolean}
 */
function isBunAvailable() {
  return getBunPath() !== null;
}

module.exports = {
  getBunPath,
  getBunxPath,
  getBunVersion,
  isBunAvailable,
};
