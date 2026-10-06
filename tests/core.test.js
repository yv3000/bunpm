const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapCommand, translateFlags } = require('../bunpm/core/mapper');
const {
  formatLine,
  formatOutput,
  formatAsNpm,
  formatAsYarn,
  formatAsPnpm,
  parseBunInstallLine,
} = require('../bunpm/core/formatter');

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

test('parses scoped packages and formats known output, preserving unknown lines', () => {
  assert.deepEqual(parseBunInstallLine('  installed @scope/pkg@1.2.3'), {
    type: 'single',
    name: '@scope/pkg',
    version: '1.2.3',
  });
  assert.deepEqual(parseBunInstallLine('  2 packages installed [12ms]'), {
    type: 'count',
    count: 2,
    time: '12ms',
  });
  assert.equal(parseBunInstallLine('not install output'), null);
  for (const invokedAs of ['npm', 'yarn', 'pnpm']) {
    const context = { invokedAs, subcommand: 'add' };
    assert.equal(
      formatLine('unrecognized diagnostic', context),
      'unrecognized diagnostic',
    );
    assert.equal(
      formatOutput('bun add v1.3.14\nunrecognized diagnostic', context),
      'unrecognized diagnostic',
    );
    assert.ok(formatLine('error: failed', context).includes('failed'));
  }
  assert.equal(
    formatLine('  2 packages installed [12ms]', {
      invokedAs: 'npm',
      subcommand: 'add',
    }),
    'added 2 packages in 12ms',
  );
});

test('formatter recognises Bun 1.3 piped output, which is not indented', () => {
  // Captured from `bun add is-number@7.0.0` and a repeated `bun install`
  // with stdout piped, which is how the wrapper always runs installs.
  const added = [
    'bun add v1.3.14 (0d9b296a)',
    'Saved lockfile',
    '',
    'installed is-number@7.0.0',
    '',
    '1 package installed [275.00ms]',
  ].join('\n');
  const unchanged =
    'Checked 1 install across 2 packages (no changes) [14.00ms]';
  const npm = { invokedAs: 'npm', subcommand: 'add' };
  assert.equal(
    formatOutput(added, npm),
    'Saved lockfile\n\nadded is-number@7.0.0\n\nadded 1 package in 275.00ms',
  );
  assert.equal(formatLine(unchanged, npm), 'up to date');
  const yarn = { invokedAs: 'yarn', subcommand: 'add' };
  assert.ok(
    formatLine('installed is-number@7.0.0', yarn).includes(
      '└─ is-number@7.0.0',
    ),
  );
  assert.equal(formatLine(unchanged, yarn), 'success Already up-to-date.');
  const pnpm = { invokedAs: 'pnpm', subcommand: 'add' };
  assert.equal(
    formatLine('1 package installed [2ms]', pnpm),
    'Packages: +1\n+',
  );
  assert.equal(formatLine(unchanged, pnpm), 'Already up to date');
});

test('formatter styles actual install counts and leaves versions unmodified', () => {
  for (const invokedAs of ['npm', 'yarn', 'pnpm']) {
    const context = { invokedAs, subcommand: 'add' };
    assert.ok(
      formatLine('  installed @scope/pkg@1.0.0', context).includes(
        '@scope/pkg',
      ),
    );
    assert.ok(formatLine('  1 package installed [1ms]', context).includes('1'));
    assert.ok(
      formatLine('  2 packages installed [2ms]', context).includes('2'),
    );
    assert.ok(!formatLine('  0 packages installed', context).includes('audit'));
    assert.equal(
      formatLine('Done in 1s', context),
      invokedAs === 'npm'
        ? null
        : invokedAs === 'yarn'
          ? 'Done in 1s.'
          : 'Done in 1s',
    );
    assert.equal(formatLine('$ build', { invokedAs, subcommand: 'run' }), null);
    assert.equal(formatLine('bun unknown', context), null);
    assert.equal(
      formatLine('1.3.14', { invokedAs, subcommand: '--version' }),
      '1.3.14',
    );
  }
});

test('dedicated manager formatters transform lines according to their CLI style', () => {
  const context = { invokedAs: 'npm', subcommand: 'add' };
  assert.equal(formatAsNpm('bun add v1.3.14', context), null);
  assert.equal(
    formatAsNpm('  installed foo@1.0.0', context),
    '  added foo@1.0.0',
  );
  assert.equal(formatAsNpm('Done in 50ms', context), null);
  assert.equal(
    formatAsNpm('error: missing package', context),
    'npm error missing package',
  );

  const yarnContext = { invokedAs: 'yarn', subcommand: 'add' };
  assert.equal(formatAsYarn('bun add v1.3.14', yarnContext), null);
  assert.equal(formatAsYarn('Done in 50ms', yarnContext), 'Done in 50ms.');
  assert.equal(formatAsYarn('error: failed', yarnContext), 'error failed');

  const pnpmContext = { invokedAs: 'pnpm', subcommand: 'add' };
  assert.equal(formatAsPnpm('bun add v1.3.14', pnpmContext), null);
  assert.equal(formatAsPnpm('Done in 50ms', pnpmContext), 'Done in 50ms');
  assert.equal(formatAsPnpm('error: failed', pnpmContext), 'ERR_PNPM failed');
});
