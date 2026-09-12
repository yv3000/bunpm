const { test, expect } = require('bun:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { getBunPath, locateBinary } = require('../bunpm/core/detector');
const { spawnCommand } = require('../bunpm/core/wrapper');

test.skipIf(process.platform !== 'win32')(
  'Windows PATH edits preserve raw values without touching the registry',
  () => {
    const result = cp.spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.resolve('tests/windows-path.ps1'),
        '-Source',
        path.resolve('bunpm/platforms/windows/scripts/path.ps1'),
      ],
      { encoding: 'utf8', timeout: 15000 },
    );
    expect({ status: result.status, stderr: result.stderr }).toEqual({
      status: 0,
      stderr: '',
    });
  },
  30000,
);

test('installer prerequisite failures name bunpm and install nothing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-prereq-'));
  const windows = process.platform === 'win32';
  const platform = windows
    ? 'windows'
    : process.platform === 'darwin'
      ? 'macos'
      : 'linux';
  const shell = locateBinary(windows ? 'powershell' : 'bash');
  expect(shell).not.toBeNull();
  try {
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    // An empty PATH resolves neither node nor bun. The installers must report
    // that themselves instead of letting the shell print its own diagnostic.
    const env = { ...process.env, HOME: home, USERPROFILE: home, PATH: '' };
    for (const key of Object.keys(env)) {
      if (
        ['PATH', 'HOME', 'USERPROFILE'].includes(key.toUpperCase()) &&
        key !== key.toUpperCase()
      )
        delete env[key];
    }
    const install = path.resolve(
      `bunpm/platforms/${platform}/scripts/install.${windows ? 'ps1' : 'sh'}`,
    );
    const result = cp.spawnSync(
      shell,
      windows
        ? [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            install,
            '-NoPath',
          ]
        : [install, '--no-path'],
      { cwd: root, env, encoding: 'utf8', timeout: 15000 },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      windows
        ? 'bunpm: install: node not found; install it separately before running bunpm setup.'
        : 'bunpm: install: node not found; install Node.js before running bunpm setup.',
    );
    // Nothing may be created before the prerequisites are satisfied.
    expect(fs.existsSync(path.join(home, '.bunpm'))).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30000);

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
    if (!windows)
      expect(
        fs.existsSync(
          path.join(home, platform === 'macos' ? '.zprofile' : '.bashrc'),
        ),
      ).toBe(false);
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
    if (!windows) {
      const profile = path.join(
        home,
        platform === 'macos' ? '.zprofile' : '.bashrc',
      );
      fs.rmSync(installed, { recursive: true, force: true });
      const reinstall = script(install, false);
      expect({ status: reinstall.status, stderr: reinstall.stderr }).toEqual({
        status: 0,
        stderr: '',
      });
      const profileContent = fs.readFileSync(profile, 'utf8');
      expect(profileContent.match(/# Added by bunpm installer/g)).toHaveLength(
        1,
      );
      expect(
        profileContent.match(/export PATH="\$HOME\/\.bunpm\/bin:\$PATH"/g),
      ).toHaveLength(1);
      const blocked = script(install, false);
      expect(blocked.status).not.toBe(0);
      expect(blocked.stderr.trim()).toBe(
        'bunpm: install: existing ~/.bunpm found; run uninstall.sh before reinstalling.',
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
    } else {
      const blocked = script(install);
      expect(blocked.status).not.toBe(0);
      expect(blocked.stderr).toContain(
        'bunpm: install: existing .bunpm found; run uninstall.ps1 before reinstalling.',
      );
      expect(script(uninstall).status).toBe(0);
    }
    expect(fs.existsSync(installed)).toBe(false);
    expect(script(uninstall, windows).status).toBe(0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30000);
