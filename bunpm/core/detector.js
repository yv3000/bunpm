const cp = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { getHomeDir } = require('./platform-detect');

function locateBinary(binaryName, fallbackPaths = []) {
  if (!/^[a-z][a-z0-9-]*$/i.test(binaryName))
    throw new TypeError('Invalid binary name');
  const windows = process.platform === 'win32';
  const ownBin = fs.realpathSync(path.join(__dirname, '..'));
  const candidates = [];
  for (let dir of (process.env.PATH || '').split(path.delimiter)) {
    dir = dir.replace(/^"(.*)"$/, '$1');
    // Empty/relative entries implicitly trust the working directory.
    if (!path.isAbsolute(dir)) continue;
    for (const ext of windows ? ['.exe', '.cmd', '.bat', ''] : [''])
      candidates.push(path.join(dir, binaryName + ext));
  }
  for (const candidate of [...candidates, ...fallbackPaths]) {
    try {
      const real = fs.realpathSync(candidate);
      const normalized = windows ? real.toLowerCase() : real;
      const root = windows ? ownBin.toLowerCase() : ownBin;
      if (normalized === root || normalized.startsWith(root + path.sep))
        continue;
      // Exclude other installed copies, including case variants on Windows.
      if (normalized.split(path.sep).includes('.bunpm')) continue;
      if (!fs.statSync(real).isFile()) continue;
      fs.accessSync(real, windows ? fs.constants.F_OK : fs.constants.X_OK);
      return candidate;
    } catch {
      /* Missing, inaccessible, or broken symlink. */
    }
  }
  return null;
}

function getBunPath() {
  return locateBinary('bun', [
    path.join(
      getHomeDir(),
      '.bun',
      'bin',
      process.platform === 'win32' ? 'bun.exe' : 'bun',
    ),
  ]);
}
function getBunxPath() {
  const bun = getBunPath();
  if (!bun) return null;
  const bunx = path.join(
    path.dirname(bun),
    process.platform === 'win32' ? 'bunx.exe' : 'bunx',
  );
  try {
    fs.accessSync(bunx, fs.constants.X_OK);
    return bunx;
  } catch {
    return bun;
  }
}
function getBunVersion() {
  const bun = getBunPath();
  if (!bun) return null;
  const result = cp.spawnSync(bun, ['--version'], {
    encoding: 'utf8',
    shell: false,
    timeout: 5000,
  });
  return !result.error && result.status === 0 ? result.stdout.trim() : null;
}
module.exports = {
  locateBinary,
  getBunPath,
  getBunxPath,
  getBunVersion,
  getYarnPath: () => locateBinary('yarn'),
  getPnpmPath: () => locateBinary('pnpm'),
  isBunAvailable: () => getBunPath() !== null,
};
