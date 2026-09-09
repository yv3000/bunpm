const { test, expect } = require('bun:test');
const path = require('node:path');
const os = require('node:os');
const { mapCommand, translateFlags } = require('../bunpm/core/mapper');
const {
  formatLine,
  formatOutput,
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
