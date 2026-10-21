// Installer PATH editing and prerequisite checks, run natively per OS.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { locateBinary } = require('../bunpm/core/detector');

// PowerShell wraps thrown errors at the console width, so compare messages
// with whitespace runs collapsed.
const flat = (text) => text.replace(/\s+/g, ' ');

describe('installer & path configuration', () => {
  for (const competingInstall of [true, false]) {
    test(
      competingInstall
        ? 'Windows installer preserves a directory created after its initial check'
        : 'Windows installer rolls back its own directory after a copy failure',
      { skip: process.platform !== 'win32', timeout: 30000 },
      () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-rollback-'));
        try {
          const home = path.join(root, 'home');
          const source = path.join(root, 'source');
          const scripts = path.join(source, 'scripts');
          const tools = path.join(root, 'tools');
          for (const dir of [
            home,
            scripts,
            tools,
            path.join(source, 'core'),
            path.join(source, 'bin'),
          ])
            fs.mkdirSync(dir, { recursive: true });
          for (const file of ['install.ps1', 'uninstall.ps1'])
            fs.copyFileSync(
              path.resolve('bunpm/platforms/windows/scripts', file),
              path.join(scripts, file),
            );
          // Missing package.json fails after the installer has copied directories.
          // The node shim models another installer winning during prerequisite checks.
          fs.writeFileSync(
            path.join(tools, 'node.cmd'),
            [
              '@echo off',
              ...(competingInstall
                ? [
                    'mkdir "%USERPROFILE%\\.bunpm"',
                    '> "%USERPROFILE%\\.bunpm\\sentinel" echo other installer',
                  ]
                : []),
              'exit /b 0',
              '',
            ].join('\r\n'),
          );
          fs.writeFileSync(path.join(tools, 'bun.cmd'), '@exit /b 0\r\n');
          const env = { ...process.env, USERPROFILE: home, PATH: tools };
          for (const key of Object.keys(env)) {
            if (
              ['PATH', 'USERPROFILE'].includes(key.toUpperCase()) &&
              key !== key.toUpperCase()
            )
              delete env[key];
          }
          const shell = locateBinary('powershell');
          assert.notEqual(shell, null);
          const result = cp.spawnSync(
            shell,
            [
              '-NoProfile',
              '-ExecutionPolicy',
              'Bypass',
              '-File',
              path.join(scripts, 'install.ps1'),
              '-NoPath',
            ],
            { cwd: root, env, encoding: 'utf8', timeout: 15000 },
          );
          assert.equal(result.status, 1, result.stderr);
          const installed = path.join(home, '.bunpm');
          if (competingInstall) {
            assert.match(result.stderr, /New-Item/);
            assert.equal(
              fs.readFileSync(path.join(installed, 'sentinel'), 'utf8').trim(),
              'other installer',
            );
          } else {
            assert.match(result.stderr, /package\.json/);
            assert.equal(fs.existsSync(installed), false);
          }
        } finally {
          fs.rmSync(root, { recursive: true, force: true });
        }
      },
    );
  }

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
        { encoding: 'utf8', timeout: 30000 },
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
      timeout: 60000,
    },
    (t) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-prereq-'));
      const windows = process.platform === 'win32';
      const platform = windows
        ? 'windows'
        : process.platform === 'darwin'
          ? 'macos'
          : 'linux';
      const shell = locateBinary(windows ? 'powershell' : 'bash');
      if (!shell) {
        if (typeof t?.skip === 'function') t.skip('shell not found');
        return;
      }
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
          { cwd: root, env, encoding: 'utf8', timeout: 30000 },
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
            timeout: 30000,
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
});
