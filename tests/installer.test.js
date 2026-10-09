// Installer PATH editing and prerequisite checks, run natively per OS.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { locateBinary } = require('../bunpm/core/detector');

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
