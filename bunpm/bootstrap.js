// bootstrap.js — bunpm v2 cross-platform installer entry point
// Detects the user's OS, downloads ONLY the relevant core/ + platform-specific
// files from GitHub, then invokes the platform-correct install script.
//
// Windows usage (PowerShell):
//   irm https://raw.githubusercontent.com/yv3000/bunpm/main/bootstrap.js -OutFile "$env:TEMP\bunpm_bootstrap.js"; node "$env:TEMP\bunpm_bootstrap.js"
//
// macOS/Linux usage (bash/zsh):
//   curl -fsSL https://raw.githubusercontent.com/yv3000/bunpm/main/bootstrap.js -o /tmp/bunpm_bootstrap.js && node /tmp/bunpm_bootstrap.js

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync } = require('child_process');

const REPO_BASE = 'https://raw.githubusercontent.com/yv3000/bunpm/main';

/**
 * Detect platform exactly the same way core/platform-detect.js does.
 * bootstrap.js cannot import core/platform-detect.js directly because at
 * the moment bootstrap.js runs, core/ has not been downloaded to disk yet —
 * this is the one and only place in the entire project where platform
 * detection logic is duplicated rather than imported from a single source,
 * and it is duplicated for exactly this unavoidable bootstrapping reason.
 * The logic itself MUST stay byte-for-byte identical to
 * core/platform-detect.js's detectPlatform() function — if you ever change
 * one, you must change the other to match, or bootstrap.js could download
 * the wrong platform subtree while core/wrapper.js (running later, on every
 * subsequent npm/yarn/pnpm invocation after install) detects a DIFFERENT
 * platform for itself, which would be a deeply confusing class of bug.
 *
 * @returns {'windows'|'macos'|'linux'}
 */
function detectPlatform() {
  const platform = process.platform;
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  throw new Error(
    `bunpm does not support this platform (${platform}). ` +
    `Supported platforms: Windows, macOS, Linux.`
  );
}

const platform = detectPlatform();
const home = os.homedir();

// Staging directory — separate from the final install destination
// (~/.bunpm with a dot), matching the v1.2.2 convention of using a
// no-dot staging folder during bootstrap.
const stagingRoot = path.join(home, 'bunpm');

// ── Core files — identical set downloaded regardless of platform ─────────
const CORE_FILES = [
  'core/platform-detect.js',
  'core/detector.js',
  'core/mapper.js',
  'core/formatter.js',
  'core/wrapper.js',
];

// ── Platform-specific files — ONLY the matching platform's subtree ───────
// This object is the literal enforcement mechanism for "only download
// what's needed for my OS." Notice there is no code path anywhere in this
// file that ever references 'platforms/windows/' while platform is
// 'linux', or vice versa — the PLATFORM_FILES object is looked up by the
// detected platform key ONCE, and only that one array of paths is ever
// touched by the download loop below.
const PLATFORM_FILES = {
  windows: [
    'platforms/windows/bin/npm.cmd',
    'platforms/windows/bin/npm',
    'platforms/windows/bin/npx.cmd',
    'platforms/windows/bin/npx',
    'platforms/windows/bin/yarn.cmd',
    'platforms/windows/bin/yarn',
    'platforms/windows/bin/pnpm.cmd',
    'platforms/windows/bin/pnpm',
    'platforms/windows/scripts/install.ps1',
    'platforms/windows/scripts/uninstall.ps1',
  ],
  macos: [
    'platforms/macos/bin/npm',
    'platforms/macos/bin/npx',
    'platforms/macos/bin/yarn',
    'platforms/macos/bin/pnpm',
    'platforms/macos/scripts/install.sh',
    'platforms/macos/scripts/uninstall.sh',
  ],
  linux: [
    'platforms/linux/bin/npm',
    'platforms/linux/bin/npx',
    'platforms/linux/bin/yarn',
    'platforms/linux/bin/pnpm',
    'platforms/linux/scripts/install.sh',
    'platforms/linux/scripts/uninstall.sh',
  ],
};

const PACKAGE_JSON_FILE = 'package.json';

/**
 * Download a single file from a GitHub raw URL to a local path,
 * following redirects (GitHub raw URLs sometimes 301/302 redirect).
 *
 * @param {string} url
 * @param {string} destPath
 * @returns {Promise<void>}
 */
function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    function get(u) {
      https.get(u, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error('HTTP ' + res.statusCode + ' for ' + u));
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', reject);
    }
    get(url);
  });
}

/**
 * Given a repo-relative file path like 'platforms/macos/bin/npm', compute
 * the correct local staging path. Platform-specific files get their
 * 'platforms/<platform>/' prefix stripped when staged locally, because the
 * end user's machine should only ever see a flat bin/ and scripts/ folder
 * matching THEIR platform — it should never see a nested platforms/macos/
 * folder structure on disk, that nesting only exists in the GitHub repo
 * for selective-download purposes as established in Part 1.
 *
 * @param {string} repoRelativePath
 * @returns {string} local staging-relative path
 */
function toLocalStagingPath(repoRelativePath) {
  const platformPrefix = `platforms/${platform}/`;
  if (repoRelativePath.startsWith(platformPrefix)) {
    return repoRelativePath.slice(platformPrefix.length);
  }
  return repoRelativePath;
}

async function main() {
  console.log('');
  console.log(`  bunpm bootstrap (detected platform: ${platform})`);
  console.log('  ------------------------------------');

  const filesToDownload = [
    ...CORE_FILES,
    ...PLATFORM_FILES[platform],
    PACKAGE_JSON_FILE,
  ];

  // Create every staging subdirectory that will be needed, derived
  // from the actual file list rather than hardcoded, so this stays
  // correct even if the file lists above change in the future.
  const dirsNeeded = new Set();
  for (const f of filesToDownload) {
    const localPath = toLocalStagingPath(f);
    dirsNeeded.add(path.dirname(path.join(stagingRoot, localPath)));
  }
  for (const d of dirsNeeded) {
    fs.mkdirSync(d, { recursive: true });
  }

  console.log('');
  console.log(`  Downloading ${filesToDownload.length} files for ${platform}...`);
  for (const f of filesToDownload) {
    const url = `${REPO_BASE}/${f}`;
    const localPath = toLocalStagingPath(f);
    const destPath = path.join(stagingRoot, localPath);
    await download(url, destPath);
    console.log(`  Downloaded: ${localPath}`);
  }

  console.log('');
  console.log('  Running platform installer...');
  console.log('');

  if (platform === 'windows') {
    const ps1Path = path.join(stagingRoot, 'scripts', 'install.ps1');
    try {
      execSync(`powershell -ExecutionPolicy Bypass -File "${ps1Path}"`, { stdio: 'inherit' });
    } catch (e) {
      console.error('Install failed with code:', e.status);
      process.exit(e.status || 1);
    }
  } else {
    // macOS or Linux
    const shPath = path.join(stagingRoot, 'scripts', 'install.sh');
    try {
      fs.chmodSync(shPath, 0o755);
    } catch {
      // if chmod fails here, the shell invocation below via `bash` rather
      // than direct execution still works, since we're explicitly invoking
      // the bash interpreter on the file rather than relying on the file's
      // own execute bit — this fallback is intentional, not a bug
    }
    try {
      execSync(`bash "${shPath}"`, { stdio: 'inherit' });
    } catch (e) {
      console.error('Install failed with code:', e.status);
      process.exit(e.status || 1);
    }
  }
}

main().catch(e => {
  console.error('');
  console.error('  Bootstrap error:', e.message);
  process.exit(1);
});