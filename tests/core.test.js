const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapCommand, translateFlags } = require('../bunpm/core/mapper');

test('maps common dependency operations without mutating input', () => {
  for (const [tool, args, expected] of [
    ['npm', ['install'], ['install']],
    ['npm', ['i', '-D', 'typescript'], ['add', '-d', 'typescript']],
    ['npm', ['remove', 'old'], ['remove', 'old']],
    ['yarn', [], ['install']],
    ['yarn', ['add', '--dev', 'typescript'], ['add', '-d', 'typescript']],
    ['pnpm', ['add', 'pkg'], ['add', 'pkg']],
    ['pnpm', ['why', 'pkg'], ['pm', 'why', 'pkg']],
  ]) {
    const original = [...args];
    assert.deepEqual(mapCommand(tool, args).bunArgs, expected);
    assert.deepEqual(args, original);
  }
});

test('unsupported and workspace commands preserve original arguments', () => {
  for (const tool of ['npm', 'yarn', 'pnpm']) {
    assert.deepEqual(mapCommand(tool, ['publish', '--tag', 'next']), {
      fallbackTo: tool,
      fallbackArgs: ['publish', '--tag', 'next'],
    });
  }
  for (const flag of ['-r', '--recursive', '--filter=app']) {
    assert.equal(mapCommand('pnpm', ['install', flag]).fallbackTo, 'pnpm');
  }
  assert.throws(() => mapCommand('other', []));
});

test('package execution passes arguments without translating script flags', () => {
  for (const [tool, args] of [
    ['npx', ['pkg', '--dev']],
    ['yarn', ['dlx', 'pkg', '--dev']],
    ['pnpm', ['dlx', 'pkg', '--dev']],
  ]) {
    assert.deepEqual(mapCommand(tool, args), {
      useBunx: true,
      bunArgs: ['pkg', '--dev'],
      fallbackTo: null,
    });
  }
  assert.deepEqual(
    translateFlags(['--registry=https://example.com', '--dev', 'pkg'], {
      '--dev': '-d',
    }),
    ['--registry=https://example.com', '-d', 'pkg'],
  );
});

test('npm options after a script name stay with npm, not the script', () => {
  // npm consumes these as config; Bun would forward them to the script.
  for (const args of [
    ['test', '--watch'],
    ['start', '--port=3000'],
    ['run', 'build', '--if-present'],
    ['run', 'build', 'src', '--silent', '--', 'x'],
  ]) {
    assert.deepEqual(mapCommand('npm', args), {
      fallbackTo: 'npm',
      fallbackArgs: args,
    });
  }
  // Positional arguments and anything after `--` are forwarded by npm too.
  assert.deepEqual(mapCommand('npm', ['run', 'build', 'src']).bunArgs, [
    'run',
    'build',
    'src',
  ]);
  assert.deepEqual(mapCommand('npm', ['test', '--', '--watch']).bunArgs, [
    'run',
    'test',
    '--watch',
  ]);
  // Yarn and pnpm forward options after the script name to the script.
  for (const tool of ['yarn', 'pnpm'])
    assert.deepEqual(mapCommand(tool, ['run', 'build', '--prod']).bunArgs, [
      'run',
      'build',
      '--prod',
    ]);
});
