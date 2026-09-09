const { test, expect } = require('bun:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { getBunPath, locateBinary } = require('../bunpm/core/detector');
const { spawnCommand } = require('../bunpm/core/wrapper');

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
  // Node keeps the first spelling when Windows receives both Path and PATH.
  for (const key of Object.keys(env)) {
    if (
      ['PATH', 'HOME', 'USERPROFILE', 'TEMP', 'TMP'].includes(
        key.toUpperCase(),
      ) &&
      key !== key.toUpperCase()
    )
      delete env[key];
  }
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
    if (windows) {
      const batch = spawnCommand(
        path.join(installed, 'bin', 'npm.cmd'),
        ['run', 'check'],
        { cwd: root, env, encoding: 'utf8', timeout: 15000 },
      );
      expect(batch.status).toBe(27);
    }
    const fallbackBin = path.join(root, 'original');
    const cli = path.join(fallbackBin, 'node_modules', 'npm', 'bin');
    fs.mkdirSync(cli, { recursive: true });
    fs.writeFileSync(
      path.join(cli, 'npm-cli.js'),
      'console.log(process.argv.slice(2).join("|")); process.exitCode=37',
    );
    fs.writeFileSync(
      path.join(fallbackBin, windows ? 'npm.cmd' : 'npm'),
      windows
        ? '@echo off\r\nexit /b 99\r\n'
        : '#!/bin/sh\nprintf "%s\\n" "$*"\nexit 37\n',
      { mode: 0o755 },
    );
    const fallback = cp.spawnSync(
      node,
      [path.join(installed, 'core', 'wrapper.js'), 'npm', 'run', 'literal'],
      {
        cwd: root,
        env: {
          ...env,
          PATH: [path.join(installed, 'bin'), fallbackBin].join(path.delimiter),
        },
        encoding: 'utf8',
        timeout: 15000,
      },
    );
    expect({
      status: fallback.status,
      stdout: fallback.stdout,
      stderr: fallback.stderr,
    }).toEqual({
      status: 37,
      stdout: windows ? 'run|literal\n' : 'run literal\n',
      stderr: '',
    });
    expect(fallback.stdout).toContain('literal');
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
