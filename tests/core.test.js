const { test, expect } = require('bun:test');
const path = require('node:path');
const os = require('node:os');
const { mapCommand, translateFlags } = require('../bunpm/core/mapper');
const {
  formatLine,
  formatOutput,
  formatAsNpm,
  formatAsYarn,
  formatAsPnpm,
  parseBunInstallLine,
} = require('../bunpm/core/formatter');
const platform = require('../bunpm/core/platform-detect');

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
    expect(mapCommand(tool, args).bunArgs).toEqual(expected);
    expect(args).toEqual(original);
  }
});

test('unsupported and workspace commands preserve original arguments', () => {
  for (const tool of ['npm', 'yarn', 'pnpm']) {
    expect(mapCommand(tool, ['publish', '--tag', 'next'])).toEqual({
      fallbackTo: tool,
      fallbackArgs: ['publish', '--tag', 'next'],
    });
  }
  for (const flag of ['-r', '--recursive', '--filter=app']) {
    expect(mapCommand('pnpm', ['install', flag]).fallbackTo).toBe('pnpm');
  }
  expect(() => mapCommand('other', [])).toThrow();
});

test('package execution passes arguments without translating script flags', () => {
  for (const [tool, args] of [
    ['npx', ['pkg', '--dev']],
    ['yarn', ['dlx', 'pkg', '--dev']],
    ['pnpm', ['dlx', 'pkg', '--dev']],
  ]) {
    expect(mapCommand(tool, args)).toEqual({
      useBunx: true,
      bunArgs: ['pkg', '--dev'],
      fallbackTo: null,
    });
  }
  expect(
    translateFlags(['--registry=https://example.com', '--dev', 'pkg'], {
      '--dev': '-d',
    }),
  ).toEqual(['--registry=https://example.com', '-d', 'pkg']);
});

test('npm options after a script name stay with npm, not the script', () => {
  // npm consumes these as config; Bun would forward them to the script.
  for (const args of [
    ['test', '--watch'],
    ['start', '--port=3000'],
    ['run', 'build', '--if-present'],
    ['run', 'build', 'src', '--silent', '--', 'x'],
  ]) {
    expect(mapCommand('npm', args)).toEqual({
      fallbackTo: 'npm',
      fallbackArgs: args,
    });
  }
  // Positional arguments and anything after `--` are forwarded by npm too.
  expect(mapCommand('npm', ['run', 'build', 'src']).bunArgs).toEqual([
    'run',
    'build',
    'src',
  ]);
  expect(mapCommand('npm', ['test', '--', '--watch']).bunArgs).toEqual([
    'run',
    'test',
    '--watch',
  ]);
  // Yarn and pnpm forward options after the script name to the script.
  for (const tool of ['yarn', 'pnpm'])
    expect(mapCommand(tool, ['run', 'build', '--prod']).bunArgs).toEqual([
      'run',
      'build',
      '--prod',
    ]);
});

test('parses scoped packages and formats known output, preserving unknown lines', () => {
  expect(parseBunInstallLine('  installed @scope/pkg@1.2.3')).toEqual({
    type: 'single',
    name: '@scope/pkg',
    version: '1.2.3',
  });
  expect(parseBunInstallLine('  2 packages installed [12ms]')).toEqual({
    type: 'count',
    count: 2,
    time: '12ms',
  });
  expect(parseBunInstallLine('not install output')).toBeNull();
  for (const invokedAs of ['npm', 'yarn', 'pnpm']) {
    const context = { invokedAs, subcommand: 'add' };
    expect(formatLine('unrecognized diagnostic', context)).toBe(
      'unrecognized diagnostic',
    );
    expect(
      formatOutput('bun add v1.3.14\nunrecognized diagnostic', context),
    ).toBe('unrecognized diagnostic');
    expect(formatLine('error: failed', context)).toContain('failed');
  }
  expect(
    formatLine('  2 packages installed [12ms]', {
      invokedAs: 'npm',
      subcommand: 'add',
    }),
  ).toBe('added 2 packages in 12ms');
});

test('platform paths use the native home and reject non-Unix profiles', () => {
  expect(platform.detectPlatform('win32')).toBe('windows');
  expect(platform.detectPlatform('darwin')).toBe('macos');
  expect(platform.detectPlatform('linux')).toBe('linux');
  expect(() => platform.detectPlatform('aix')).toThrow('does not support');
  expect(platform.detectPlatform()).toBe(
    { win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform],
  );
  expect(platform.getHomeDir()).toBe(os.homedir());
  expect(platform.getInstallRoot()).toBe(path.join(os.homedir(), '.bunpm'));
  expect(platform.getBinDir()).toBe(
    path.join(platform.getInstallRoot(), 'bin'),
  );
  expect(platform.getCoreDir()).toBe(
    path.join(platform.getInstallRoot(), 'core'),
  );
  expect(platform.getScriptsDir()).toBe(
    path.join(platform.getInstallRoot(), 'scripts'),
  );
  expect(platform.getShellProfileCandidates('macos')[0]).toBe(
    path.join(os.homedir(), '.zprofile'),
  );
  expect(platform.getShellProfileCandidates('linux')[0]).toBe(
    path.join(os.homedir(), '.bashrc'),
  );
  expect(() => platform.getShellProfileCandidates('windows')).toThrow(
    'non-Unix',
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
  expect(formatOutput(added, npm)).toBe(
    'Saved lockfile\n\nadded is-number@7.0.0\n\nadded 1 package in 275.00ms',
  );
  expect(formatLine(unchanged, npm)).toBe('up to date');
  const yarn = { invokedAs: 'yarn', subcommand: 'add' };
  expect(formatLine('installed is-number@7.0.0', yarn)).toContain(
    '└─ is-number@7.0.0',
  );
  expect(formatLine(unchanged, yarn)).toBe('success Already up-to-date.');
  const pnpm = { invokedAs: 'pnpm', subcommand: 'add' };
  expect(formatLine('1 package installed [2ms]', pnpm)).toBe('Packages: +1\n+');
  expect(formatLine(unchanged, pnpm)).toBe('Already up to date');
});

test('formatter styles actual install counts and leaves versions unmodified', () => {
  for (const invokedAs of ['npm', 'yarn', 'pnpm']) {
    const context = { invokedAs, subcommand: 'add' };
    expect(formatLine('  installed @scope/pkg@1.0.0', context)).toContain(
      '@scope/pkg',
    );
    expect(formatLine('  1 package installed [1ms]', context)).toContain('1');
    expect(formatLine('  2 packages installed [2ms]', context)).toContain('2');
    expect(formatLine('  0 packages installed', context)).not.toContain(
      'audit',
    );
    expect(formatLine('Done in 1s', context)).toBe(
      invokedAs === 'npm'
        ? null
        : invokedAs === 'yarn'
          ? 'Done in 1s.'
          : 'Done in 1s',
    );
    expect(formatLine('$ build', { invokedAs, subcommand: 'run' })).toBeNull();
    expect(formatLine('bun unknown', context)).toBeNull();
    expect(formatLine('1.3.14', { invokedAs, subcommand: '--version' })).toBe(
      '1.3.14',
    );
  }
});

test('dedicated manager formatters transform lines according to their CLI style', () => {
  const context = { invokedAs: 'npm', subcommand: 'add' };
  expect(formatAsNpm('bun add v1.3.14', context)).toBeNull();
  expect(formatAsNpm('  installed foo@1.0.0', context)).toBe(
    '  added foo@1.0.0',
  );
  expect(formatAsNpm('Done in 50ms', context)).toBeNull();
  expect(formatAsNpm('error: missing package', context)).toBe(
    'npm error missing package',
  );

  const yarnContext = { invokedAs: 'yarn', subcommand: 'add' };
  expect(formatAsYarn('bun add v1.3.14', yarnContext)).toBeNull();
  expect(formatAsYarn('Done in 50ms', yarnContext)).toBe('Done in 50ms.');
  expect(formatAsYarn('error: failed', yarnContext)).toBe('error failed');

  const pnpmContext = { invokedAs: 'pnpm', subcommand: 'add' };
  expect(formatAsPnpm('bun add v1.3.14', pnpmContext)).toBeNull();
  expect(formatAsPnpm('Done in 50ms', pnpmContext)).toBe('Done in 50ms');
  expect(formatAsPnpm('error: failed', pnpmContext)).toBe('ERR_PNPM failed');
});
