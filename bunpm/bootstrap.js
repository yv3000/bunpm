// Standalone remote bootstrap: no imports from files not yet downloaded.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const { pipeline } = require('node:stream/promises');
const cp = require('node:child_process');

function detectPlatform(platform = process.platform) {
  const supported = { win32: 'windows', darwin: 'macos', linux: 'linux' };
  if (!Object.hasOwn(supported, platform))
    throw new Error(`Unsupported platform: ${platform}`);
  return supported[platform];
}

function filesFor(platform) {
  if (!['windows', 'macos', 'linux'].includes(platform))
    throw new Error('Unsupported platform');
  const files = [
    'platform-detect.js',
    'detector.js',
    'mapper.js',
    'formatter.js',
    'wrapper.js',
  ].map((file) => `core/${file}`);
  for (const name of ['npm', 'npx', 'yarn', 'pnpm']) {
    files.push(`platforms/${platform}/bin/${name}`);
    if (platform === 'windows')
      files.push(`platforms/${platform}/bin/${name}.cmd`);
  }
  for (const name of ['install', 'uninstall'])
    files.push(
      `platforms/${platform}/scripts/${name}.${platform === 'windows' ? 'ps1' : 'sh'}`,
    );
  if (platform === 'windows') files.push('platforms/windows/scripts/path.ps1');
  return [...files, 'package.json'];
}

function validateUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'raw.githubusercontent.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    !/^\/yv3000\/bunpm\/[a-f0-9]{40}\/bunpm\//.test(url.pathname)
  ) {
    throw new Error(
      'Unsafe download URL: expected this repository at an immutable HTTPS revision',
    );
  }
  return url;
}

async function download(
  value,
  destination,
  { timeoutMs = 15000, maxBytes = 1024 * 1024 } = {},
) {
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0
  )
    throw new TypeError('Invalid download limits');
  let url = validateUrl(value);
  const initial = url;
  let activeRequest, activeResponse;
  let rejectTimeout;
  const deadline = new Promise((_resolve, reject) => {
    rejectTimeout = reject;
  });
  const timer = setTimeout(() => {
    const error = new Error('Download timed out');
    rejectTimeout(error);
    activeResponse?.destroy(error);
    activeRequest?.destroy(error);
  }, timeoutMs);
  const partial = `${destination}.partial`;
  let created = false;
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await Promise.race([
        deadline,
        new Promise((resolve, reject) => {
          activeRequest = https.get(url, {}, resolve);
          activeRequest.on('error', reject);
        }),
      ]);
      activeResponse = response;
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.destroy();
        if (!response.headers.location || redirects === 5)
          throw new Error('Invalid or excessive redirect');
        url = validateUrl(new URL(response.headers.location, url));
        if (url.pathname.split('/')[3] !== initial.pathname.split('/')[3])
          throw new Error('Redirect changed revision');
        continue;
      }
      if (response.statusCode !== 200) {
        response.destroy();
        throw new Error(`HTTP ${response.statusCode}`);
      }
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes)
          response.destroy(new Error('Download exceeds size limit'));
      });
      // Exclusive creation prevents following an existing partial-file symlink.
      let fd;
      try {
        fd = fs.openSync(partial, 'wx', 0o600);
      } catch (error) {
        response.destroy();
        throw error;
      }
      created = true;
      await Promise.race([
        deadline,
        pipeline(response, fs.createWriteStream(partial, { fd })),
      ]);
      if (!bytes) throw new Error('Empty download');
      fs.renameSync(partial, destination);
      return;
    }
  } finally {
    clearTimeout(timer);
    activeResponse?.destroy();
    activeRequest?.destroy();
    if (created) fs.rmSync(partial, { force: true });
  }
}

async function main(args = process.argv.slice(2)) {
  if (
    args.length !== 2 ||
    args[0] !== '--revision' ||
    !/^[a-f0-9]{40}$/.test(args[1])
  )
    throw new Error(
      'Usage: node bootstrap.js --revision <40-character commit SHA>',
    );
  const platform = detectPlatform();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-download-'));
  try {
    for (const file of filesFor(platform)) {
      const local = file.replace(`platforms/${platform}/`, '');
      const destination = path.join(root, local);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      await download(
        `https://raw.githubusercontent.com/yv3000/bunpm/${args[1]}/bunpm/${file}`,
        destination,
      );
    }
    const windows = platform === 'windows';
    const script = path.join(
      root,
      'scripts',
      windows ? 'install.ps1' : 'install.sh',
    );
    const result = cp.spawnSync(
      windows ? 'powershell.exe' : 'bash',
      windows
        ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script]
        : [script],
      { stdio: 'inherit', shell: false },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`Installer failed (${result.status ?? result.signal})`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = { detectPlatform, filesFor, validateUrl, download, main };
if (require.main === module)
  main().catch((error) => {
    // Same `bunpm: <component>: <message>` convention as core/wrapper.js, spelled
    // out here because bootstrap must not import files it has not downloaded yet.
    console.error(`bunpm: bootstrap: ${error.message}`);
    process.exitCode = 1;
  });
