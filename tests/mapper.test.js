const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapCommand } = require('../bunpm/core/mapper');

test('boolean flags with an explicit value fall back instead of being reinterpreted', () => {
  for (const [tool, args] of [
    ['npm', ['install', '--save=false', 'pkg']],
    ['npm', ['i', '--save-dev=false', 'pkg']],
    ['npm', ['i', '-g=false', 'pkg']],
    ['npm', ['install', '--production=false']],
    ['yarn', ['add', '--dev=false', 'pkg']],
    ['pnpm', ['add', '-D=false', 'pkg']],
  ])
    assert.deepEqual(mapCommand(tool, args), {
      fallbackTo: tool,
      fallbackArgs: args,
    });
  assert.deepEqual(
    mapCommand('npm', ['i', '--registry=https://r.test', 'pkg']).bunArgs,
    ['add', '--registry=https://r.test', 'pkg'],
  );
});

/**
 * @param {string} tool
 * @param {[string[], string[]][]} cases
 */
function assertBunArgs(tool, cases) {
  for (const [args, expected] of cases)
    assert.deepEqual(
      mapCommand(tool, args).bunArgs,
      expected,
      `${tool} ${args.join(' ')}`,
    );
}

/**
 * @param {string} tool
 * @param {string[][]} cases
 */
function assertFallback(tool, cases) {
  for (const args of cases)
    assert.deepEqual(mapCommand(tool, args), {
      fallbackTo: tool,
      fallbackArgs: args,
    });
}

test('npm command aliases map to their Bun equivalents', () => {
  assertBunArgs('npm', [
    ...['uninstall', 'rm', 'r', 'un'].map((alias) => [
      [alias, 'x'],
      ['remove', 'x'],
    ]),
    [['t'], ['run', 'test']],
    ...['start', 'stop', 'restart'].map((name) => [[name], ['run', name]]),
    ...['update', 'upgrade', 'up'].map((alias) => [[alias], ['update']]),
    ...['ls', 'list'].map((alias) => [[alias], ['pm', 'ls']]),
    [['outdated'], ['outdated']],
    [
      ['link', 'x'],
      ['link', 'x'],
    ],
    [
      ['create', 'vite'],
      ['create', 'vite'],
    ],
    [
      ['run-script', 'build'],
      ['run', 'build'],
    ],
  ]);
});

test('npm install flags translate to Bun flags', () => {
  assertBunArgs('npm', [
    [
      ['i', '-g', 'x'],
      ['add', '-g', 'x'],
    ],
    [
      ['i', '--global', 'x'],
      ['add', '-g', 'x'],
    ],
    [
      ['i', '--save-exact', 'x'],
      ['add', '-E', 'x'],
    ],
    [
      ['i', '-E', 'x'],
      ['add', '-E', 'x'],
    ],
    [
      ['i', '-S', 'x'],
      ['add', 'x'],
    ],
    [
      ['i', '--save', 'x'],
      ['add', 'x'],
    ],
    ...['--quiet', '-q', '--silent'].map((flag) => [
      ['i', flag],
      ['install', '--silent'],
    ]),
    ...['-f', '--force'].map((flag) => [
      ['i', flag],
      ['install', '--force'],
    ]),
    [
      ['i', '--production'],
      ['install', '--production'],
    ],
    [
      ['i', '--no-save', 'x'],
      ['add', '--no-save', 'x'],
    ],
    ...['--ignore-scripts', '--frozen-lockfile', '--verbose'].map((flag) => [
      ['i', flag],
      ['install', flag],
    ]),
    [
      ['i', '--registry', 'https://r.test', 'x'],
      ['add', '--registry', 'https://r.test', 'x'],
    ],
  ]);
});

test('yarn commands and flags map to Bun, unsupported ones fall back', () => {
  assertBunArgs('yarn', [
    ...['up', 'upgrade'].map((alias) => [[alias], ['update']]),
    [
      ['why', 'x'],
      ['pm', 'why', 'x'],
    ],
    [['list'], ['pm', 'ls']],
    ...[
      ['link', 'x'],
      ['unlink', 'x'],
      ['install'],
      ['create', 'vite'],
      ['outdated'],
      ['remove', 'x'],
      ['install', '--frozen-lockfile'],
    ].map((args) => [args, args]),
    [['test'], ['run', 'test']],
    [['start'], ['run', 'start']],
    [
      ['add', '--exact', 'x'],
      ['add', '-E', 'x'],
    ],
    [
      ['add', '-E', 'x'],
      ['add', '-E', 'x'],
    ],
    [
      ['add', '-D', 'x'],
      ['add', '-d', 'x'],
    ],
  ]);
  assertFallback('yarn', [
    ['add', '--global', 'x'],
    ['add', '-g', 'x'],
    ['add', '--save', 'x'],
  ]);
});

test('pnpm commands and flags map to Bun', () => {
  assertBunArgs('pnpm', [
    [['i'], ['install']],
    [['install'], ['install']],
    [
      ['add', '-D', 'x'],
      ['add', '-d', 'x'],
    ],
    [
      ['add', '--save-dev', 'x'],
      ['add', '-d', 'x'],
    ],
    [
      ['remove', 'x'],
      ['remove', 'x'],
    ],
    [['up'], ['update']],
    [['ls'], ['pm', 'ls']],
    [['start'], ['run', 'start']],
  ]);
  assert.deepEqual(mapCommand('pnpm', ['dlx', 'create-vite']), {
    useBunx: true,
    bunArgs: ['create-vite'],
    fallbackTo: null,
  });
});

test('pnpm workspace selection and npx options fall back', () => {
  assertFallback('pnpm', [
    ['run', 'build', '--filter', 'app'],
    ['run', 'build', '--filter=app'],
    ['run', 'build', '--recursive'],
    ['test', '-r'],
    ['--filter', 'app', 'build'],
    ['-r', 'test'],
    ['add', 'x', '-w'],
    ['add', 'x', '--workspace-root'],
  ]);
  assertFallback('npx', [
    ['-y', 'pkg'],
    ['--package', 'x', 'cmd'],
  ]);
});

test('a global npm install without a package stays with npm', () => {
  for (const args of [
    ['install', '-g'],
    ['i', '--global'],
    ['install', '--global', '--ignore-scripts'],
  ])
    assert.deepEqual(mapCommand('npm', args), {
      fallbackTo: 'npm',
      fallbackArgs: args,
    });
  // With a package name it is still a plain global add.
  assert.deepEqual(mapCommand('npm', ['install', '-g', 'typescript']).bunArgs, [
    'add',
    '-g',
    'typescript',
  ]);
});

test('pnpm install with package names falls back to pnpm', () => {
  for (const args of [
    ['install', 'lodash'],
    ['i', '--frozen-lockfile', 'lodash'],
  ])
    assert.equal(mapCommand('pnpm', args).fallbackTo, 'pnpm');
  // A plain or flag-only install still runs through Bun.
  assert.deepEqual(mapCommand('pnpm', ['i', '--frozen-lockfile']).bunArgs, [
    'install',
    '--frozen-lockfile',
  ]);
});
