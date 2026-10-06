// Unix uninstall.sh profile cleanup. The Windows uninstaller edits the
// registry instead; its PATH logic is covered by tests/windows-path.ps1 and
// the smoke test runs it with -NoPath, so these tests skip on Windows.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const skip = process.platform === 'win32';
const script = path.resolve(
  'bunpm/platforms',
  process.platform === 'darwin' ? 'macos' : 'linux',
  'scripts/uninstall.sh',
);
const MARK = '# Added by bunpm installer';
const LINE = 'export PATH="$HOME/.bunpm/bin:$PATH"';

/** @param {(home: string) => void} body */
function withHome(body) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-uninstall-'));
  try {
    fs.mkdirSync(path.join(home, '.bunpm', 'bin'), { recursive: true });
    body(home);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

/**
 * @param {string} home
 * @param {string[]} [args]
 */
function uninstall(home, args = []) {
  return cp.spawnSync('bash', [script, ...args], {
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
    timeout: 15000,
  });
}

test(
  'uninstall strips only bunpm PATH blocks, writing through symlinked profiles',
  { skip },
  () =>
    withHome((home) => {
      const target = path.join(home, 'dotfiles', 'zshrc');
      fs.mkdirSync(path.dirname(target));
      fs.writeFileSync(
        target,
        `export KEEP=1\n\n${MARK}\n${LINE}\nalias ll='ls -l'\n`,
      );
      fs.symlinkSync(target, path.join(home, '.zshrc'));
      // Legacy absolute spelling under a marker, an unmarked user copy of the
      // line, a marker guarding other content and a trailing marker.
      const profile = path.join(home, '.profile');
      fs.writeFileSync(
        profile,
        [
          MARK,
          `export PATH="${home}/.bunpm/bin:$PATH"`,
          LINE,
          MARK,
          'echo unrelated',
          MARK,
          '',
        ].join('\n'),
      );
      const result = uninstall(home);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, '');
      assert.match(result.stdout, /^bunpm removed\./);
      assert.equal(fs.existsSync(path.join(home, '.bunpm')), false);
      assert.ok(fs.lstatSync(path.join(home, '.zshrc')).isSymbolicLink());
      assert.equal(
        fs.readFileSync(target, 'utf8'),
        `export KEEP=1\n\nalias ll='ls -l'\n`,
      );
      assert.equal(
        fs.readFileSync(profile, 'utf8'),
        [LINE, MARK, 'echo unrelated', MARK, ''].join('\n'),
      );
      assert.equal(fs.existsSync(path.join(home, '.bashrc')), false);
    }),
);

test(
  '--no-path removes the install and leaves profiles byte-identical',
  { skip },
  () =>
    withHome((home) => {
      const bashrc = path.join(home, '.bashrc');
      const content = `${MARK}\n${LINE}\n`;
      fs.writeFileSync(bashrc, content);
      const result = uninstall(home, ['--no-path']);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(fs.readFileSync(bashrc, 'utf8'), content);
      assert.equal(fs.existsSync(path.join(home, '.bunpm')), false);
    }),
);

test(
  'unknown arguments are rejected before anything is removed',
  { skip },
  () =>
    withHome((home) => {
      const bashrc = path.join(home, '.bashrc');
      const content = `${MARK}\n${LINE}\n`;
      fs.writeFileSync(bashrc, content);
      for (const args of [['--bogus'], ['--no-path', 'extra']]) {
        const result = uninstall(home, args);
        assert.equal(result.status, 1);
        assert.equal(
          result.stderr.trim(),
          'bunpm: uninstall: usage: uninstall.sh [--no-path]',
        );
        assert.equal(fs.existsSync(path.join(home, '.bunpm')), true);
        assert.equal(fs.readFileSync(bashrc, 'utf8'), content);
      }
    }),
);
