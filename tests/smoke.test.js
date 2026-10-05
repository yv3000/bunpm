const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { getBunPath, locateBinary } = require('../bunpm/core/detector');
const { spawnCommand } = require('../bunpm/core/wrapper');

// PowerShell wraps thrown errors at the console width, so compare messages
// with whitespace runs collapsed.
const flat = (text) => text.replace(/\s+/g, ' ');

test(
  'Windows PATH edits preserve raw values without touching the registry',
  { skip: process.platform !== 'win32', timeout: 30000 },
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
    assert.deepEqual(
      { status: result.status, stderr: result.stderr },
      {
        status: 0,
        stderr: '',
      },
    );
  },
);

test(
  'installer prerequisite failures name bunpm and install nothing',
  {
    timeout: 30000,
  },
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-prereq-'));
    const windows = process.platform === 'win32';
    const platform = windows
      ? 'windows'
      : process.platform === 'darwin'
        ? 'macos'
        : 'linux';
    const shell = locateBinary(windows ? 'powershell' : 'bash');
    assert.notEqual(shell, null);
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
      assert.notEqual(result.status, 0);
      assert.ok(
        flat(result.stderr).includes(
          windows
            ? 'bunpm: install: node not found; install it separately before running bunpm setup.'
            : 'bunpm: install: node not found; install Node.js before running bunpm setup.',
        ),
      );
      // Nothing may be created before the prerequisites are satisfied.
      assert.equal(fs.existsSync(path.join(home, '.bunpm')), false);
      // A node that exists but fails is a different problem from a missing one.
      const broken = path.join(root, 'broken-bin');
      fs.mkdirSync(broken);
      fs.writeFileSync(
        path.join(broken, windows ? 'node.cmd' : 'node'),
        windows ? '@exit /b 3\r\n' : '#!/bin/sh\nexit 3\n',
        { mode: 0o755 },
      );
      const failed = cp.spawnSync(
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
        {
          cwd: root,
          env: { ...env, PATH: broken },
          encoding: 'utf8',
          timeout: 15000,
        },
      );
      assert.notEqual(failed.status, 0);
      assert.ok(
        flat(failed.stderr).includes(
          'bunpm: install: node --version failed with exit 3; repair your node installation.',
        ),
      );
      assert.equal(fs.existsSync(path.join(home, '.bunpm')), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'native offline install, launcher, package script, fallback and uninstall',
  {
    timeout: 30000,
  },
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-smoke-'));
    const windows = process.platform === 'win32';
    const platform = windows
      ? 'windows'
      : process.platform === 'darwin'
        ? 'macos'
        : 'linux';
    const bun = getBunPath();
    const node = locateBinary('node');
    assert.notEqual(bun, null);
    assert.notEqual(node, null);
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
        assert.equal(
          fs.existsSync(
            path.join(home, platform === 'macos' ? '.zprofile' : '.bashrc'),
          ),
          false,
        );
      const result = script(install, windows);
      assert.deepEqual(
        {
          status: result.status,
          error: result.error?.message,
          stderr: result.stderr,
        },
        { status: 0, error: undefined, stderr: '' },
      );
      const installed = path.join(home, '.bunpm');
      assert.equal(
        fs.existsSync(
          path.join(installed, 'scripts', path.basename(uninstall)),
        ),
        true,
      );
      const launcher = path.join(installed, 'bin', 'npm');
      const invoke = (args) =>
        cp.spawnSync(windows ? node : 'bash', [launcher, ...args], {
          cwd: root,
          env,
          encoding: 'utf8',
          timeout: 15000,
        });
      assert.equal(invoke(['run', 'check']).status, 27);
      assert.equal(invoke(['test']).status, 29);
      if (windows) {
        const batch = spawnCommand(
          path.join(installed, 'bin', 'npm.cmd'),
          ['run', 'check'],
          { cwd: root, env, encoding: 'utf8', timeout: 15000 },
        );
        assert.equal(batch.status, 27);
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
            PATH: [path.join(installed, 'bin'), fallbackBin].join(
              path.delimiter,
            ),
          },
          encoding: 'utf8',
          timeout: 15000,
        },
      );
      assert.deepEqual(
        {
          status: fallback.status,
          stdout: fallback.stdout,
          stderr: fallback.stderr,
        },
        {
          status: 37,
          stdout: windows ? 'run|literal\n' : 'run literal\n',
          stderr: '',
        },
      );
      assert.ok(fallback.stdout.includes('literal'));
      if (!windows) {
        const profile = path.join(
          home,
          platform === 'macos' ? '.zprofile' : '.bashrc',
        );
        fs.rmSync(installed, { recursive: true, force: true });
        const reinstall = script(install, false);
        assert.deepEqual(
          { status: reinstall.status, stderr: reinstall.stderr },
          {
            status: 0,
            stderr: '',
          },
        );
        const profileContent = fs.readFileSync(profile, 'utf8');
        assert.equal(
          profileContent.match(/# Added by bunpm installer/g).length,
          1,
        );
        assert.equal(
          profileContent.match(/export PATH="\$HOME\/\.bunpm\/bin:\$PATH"/g)
            .length,
          1,
        );
        const blocked = script(install, false);
        assert.notEqual(blocked.status, 0);
        assert.equal(
          blocked.stderr.trim(),
          'bunpm: install: existing ~/.bunpm found; run uninstall.sh before reinstalling.',
        );
        fs.appendFileSync(
          profile,
          '# keep .bunpm/bin reference\nexport UNRELATED=ok\n',
        );
        assert.equal(script(uninstall, false).status, 0);
        assert.ok(
          fs
            .readFileSync(profile, 'utf8')
            .includes('# keep .bunpm/bin reference\nexport UNRELATED=ok'),
        );
        assert.ok(
          !fs.readFileSync(profile, 'utf8').includes('# Added by bunpm'),
        );
      } else {
        const blocked = script(install);
        assert.notEqual(blocked.status, 0);
        assert.ok(
          flat(blocked.stderr).includes(
            'bunpm: install: existing .bunpm found; run uninstall.ps1 before reinstalling.',
          ),
        );
        assert.equal(script(uninstall).status, 0);
      }
      assert.equal(fs.existsSync(installed), false);
      assert.equal(script(uninstall, windows).status, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
