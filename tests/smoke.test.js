const { test, expect } = require('bun:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { getBunPath, locateBinary } = require('../bunpm/core/detector');

test('native offline install, launcher, package script, fallback and uninstall', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-smoke-'));
  const windows = process.platform === 'win32';
  const platform = windows
    ? 'windows'
    : process.platform === 'darwin'
      ? 'macos'
      : 'linux';
  const bun = getBunPath();
  const node = locateBinary('node');
  expect(bun).not.toBeNull();
  expect(node).not.toBeNull();
  const home = path.join(root, 'home with spaces');
  fs.mkdirSync(home);
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    TEMP: root,
    TMP: root,
    TMPDIR: root,
    PATH: [path.dirname(node), path.dirname(bun), process.env.PATH].join(
      path.delimiter,
    ),
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
  };
  // This command has no dependencies; it must not download or install anything.
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      scripts: {
        check: 'node -e "process.exit(27)"',
        test: 'node -e "process.exit(29)"',
      },
    }),
  );
  function script(file, noPath = true) {
    return cp.spawnSync(
      windows ? 'powershell.exe' : 'bash',
      windows
        ? [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            file,
            ...(noPath ? ['-NoPath'] : []),
          ]
        : [file, ...(noPath ? ['--no-path'] : [])],
      { cwd: root, env, encoding: 'utf8', timeout: 15000 },
    );
  }
  const install = path.resolve(
    `bunpm/platforms/${platform}/scripts/install.${windows ? 'ps1' : 'sh'}`,
  );
  const uninstall = path.resolve(
    `bunpm/platforms/${platform}/scripts/uninstall.${windows ? 'ps1' : 'sh'}`,
  );
  try {
    const result = script(install, windows);
    expect({
      status: result.status,
      error: result.error?.message,
      stderr: result.stderr,
    }).toEqual({ status: 0, error: undefined, stderr: '' });
    const installed = path.join(home, '.bunpm');
    expect(
      fs.existsSync(path.join(installed, 'scripts', path.basename(uninstall))),
    ).toBe(true);
    const launcher = path.join(installed, 'bin', 'npm');
    const invoke = (args) =>
      cp.spawnSync(windows ? node : 'bash', [launcher, ...args], {
        cwd: root,
        env,
        encoding: 'utf8',
        timeout: 15000,
      });
    expect(invoke(['run', 'check']).status).toBe(27);
    expect(invoke(['test']).status).toBe(29);
    expect(script(install, windows).status).not.toBe(0);
    if (!windows) {
      const profile = path.join(
        home,
        platform === 'macos' ? '.zprofile' : '.bashrc',
      );
      fs.appendFileSync(
        profile,
        '# keep .bunpm/bin reference\nexport UNRELATED=ok\n',
      );
      expect(script(uninstall, false).status).toBe(0);
      expect(fs.readFileSync(profile, 'utf8')).toContain(
        '# keep .bunpm/bin reference\nexport UNRELATED=ok',
      );
      expect(fs.readFileSync(profile, 'utf8')).not.toContain(
        '# Added by bunpm',
      );
    } else expect(script(uninstall).status).toBe(0);
    expect(fs.existsSync(installed)).toBe(false);
    expect(script(uninstall, windows).status).toBe(0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30000);
