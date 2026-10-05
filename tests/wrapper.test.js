const { test, mock: nodeMock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const detector = require('../bunpm/core/detector');
const { main, spawnCommand, exitCode } = require('../bunpm/core/wrapper');
const {
  mapCommand,
  mapNpmCommand,
  mapYarnCommand,
  mapPnpmCommand,
  translateFlags,
  hasNonFlagArgs,
} = require('../bunpm/core/mapper');
const dirs = [];
// Read PATH through process.env, which is case-insensitive on Windows. A
// { ...process.env } snapshot keeps Windows' literal `Path` key, so `.PATH`
// would be undefined and restoring it would set PATH to the string "undefined"
// for every later test in this process.
const savedPath = process.env.PATH;
function mock(object, key, implementation) {
  return nodeMock.method(object, key, implementation);
}
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-test-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  nodeMock.restoreAll();
  // Assigning undefined would store the string "undefined"; an absent PATH
  // must stay absent.
  if (savedPath === undefined) delete process.env.PATH;
  else process.env.PATH = savedPath;
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

test('routing preserves scripts and falls back instead of guessing semantics', () => {
  for (const tool of ['npm', 'yarn', 'pnpm']) {
    for (const args of [
      ['--version'],
      ['-v'],
      ['version', 'patch'],
      ['init', '-y'],
      ['ci'],
      ['exec', 'tool'],
      ['constructor'],
      ['__proto__'],
      ['add', 'pkg', '--unknown'],
    ]) {
      assert.deepEqual(mapCommand(tool, args), {
        fallbackTo: tool,
        fallbackArgs: args,
      });
    }
    assert.deepEqual(
      mapCommand(tool, ['test', '--', '-D', '', '--filter=x']).bunArgs ?? [],
      tool === 'pnpm' ? [] : ['run', 'test', '-D', '', '--filter=x'],
    );
    assert.deepEqual(
      mapCommand(tool, ['run', 'build', '--', '-D', '']).bunArgs,
      ['run', 'build', '-D', ''],
    );
    assert.equal(mapCommand(tool, ['run', '--help']).fallbackTo, tool);
  }
  assert.equal(mapCommand('yarn', ['dev']).fallbackTo, 'yarn');
  assert.equal(
    mapCommand('yarn', ['global', 'remove', 'pkg']).fallbackTo,
    'yarn',
  );
  assert.deepEqual(mapCommand('yarn', ['global', 'add', 'pkg']).bunArgs, [
    'add',
    '-g',
    'pkg',
  ]);
  assert.deepEqual(
    mapCommand('npm', ['install', '--registry', 'https://example.test'])
      .bunArgs,
    ['install', '--registry', 'https://example.test'],
  );
  assert.equal(mapCommand('npm', ['install', '--registry']).fallbackTo, 'npm');
  assert.equal(mapCommand('npm', []).fallbackTo, 'npm');
  assert.deepEqual(mapCommand('pnpm', []).bunArgs, ['install']);
  assert.equal(mapCommand('npx', []).fallbackTo, 'npx');
  assert.equal(mapCommand('npx', ['--version']).fallbackTo, 'npx');
  assert.equal(mapCommand('yarn', ['dlx']).fallbackTo, 'yarn');
  assert.deepEqual(mapCommand('npm', ['add', '--', '-pkg']).bunArgs, [
    'add',
    '--',
    '-pkg',
  ]);
  assert.deepEqual(
    translateFlags(['--save', '--registry=x', '--', '-D', ''], {
      '--save': '',
      '--registry': '--registry',
      '-D': '-d',
    }),
    ['--registry=x', '--', '-D', ''],
  );
  assert.equal(hasNonFlagArgs(['--registry', 'x', 'pkg']), true);
  assert.deepEqual(mapNpmCommand(['i']).bunArgs, ['install']);
  assert.deepEqual(mapYarnCommand([]).bunArgs, ['install']);
  assert.deepEqual(mapPnpmCommand([]).bunArgs, ['install']);
  for (const args of [null, {}, [3], ['a\0b']])
    assert.throws(() => mapCommand('npm', args), /Arguments/);
});

test('native binary discovery skips wrapper roots, relative PATH and directories', () => {
  const root = fixture();
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const fake = path.join(
    bin,
    process.platform === 'win32' ? 'yarn.cmd' : 'yarn',
  );
  fs.writeFileSync(fake, 'fixture', { mode: 0o755 });
  const other = path.join(root, '.bunpm', 'bin');
  fs.mkdirSync(other, { recursive: true });
  fs.writeFileSync(path.join(other, path.basename(fake)), 'wrapper', {
    mode: 0o755,
  });
  process.env.PATH = ['', '.', other, `"${bin}"`].join(path.delimiter);
  assert.equal(detector.getYarnPath(), fake);
  assert.equal(detector.getPnpmPath(), null);
  assert.equal(detector.locateBinary('yarn'), fake);
  assert.throws(() => detector.locateBinary('bun & echo'), /Invalid binary/);
  process.env.PATH = '';
  assert.equal(detector.locateBinary('yarn', [bin, fake]), fake);
  assert.equal(
    detector.locateBinary('yarn', [path.join(root, 'missing')]),
    null,
  );
});

test('Bun detection and version failures use direct argument arrays', () => {
  const root = fixture();
  const bun = path.join(root, process.platform === 'win32' ? 'bun.exe' : 'bun');
  fs.writeFileSync(bun, 'fixture', { mode: 0o755 });
  process.env.PATH = root;
  assert.equal(detector.isBunAvailable(), true);
  assert.equal(detector.getBunPath(), bun);
  assert.equal(detector.getBunxPath(), bun);
  const bunx = path.join(
    root,
    process.platform === 'win32' ? 'bunx.exe' : 'bunx',
  );
  fs.writeFileSync(bunx, 'fixture', { mode: 0o755 });
  assert.equal(detector.getBunxPath(), bunx);
  const spawn = mock(cp, 'spawnSync', () => ({
    status: 0,
    stdout: '1.3.14\n',
  }));
  assert.equal(detector.getBunVersion(), '1.3.14');
  assert.deepEqual(spawn.mock.calls[0].arguments[1], ['--version']);
  spawn.mock.mockImplementation(() => ({ status: 1, stdout: '' }));
  assert.equal(detector.getBunVersion(), null);
});

test('wrapper keeps exit codes, interactive stdio and formatted streams', () => {
  mock(detector, 'getBunPath', () => process.execPath);
  const spawn = mock(cp, 'spawnSync', () => ({
    status: 7,
    stdout: '  2 packages installed [1ms]\n',
    stderr: 'error: no\n',
  }));
  const out = mock(process.stdout, 'write', () => true);
  const err = mock(process.stderr, 'write', () => true);
  // Restore the streams at once: node:test reports results over stdout.
  try {
    assert.equal(main('npm', ['install']), 7);
  } finally {
    out.mock.restore();
    err.mock.restore();
  }
  assert.ok(
    out.mock.calls.some((c) => c.arguments[0] === 'added 2 packages in 1ms\n'),
  );
  assert.ok(err.mock.calls.some((c) => c.arguments[0] === 'npm error no\n'));
  assert.equal(spawn.mock.calls[0].arguments[2].shell, false);
  spawn.mock.mockImplementation(() => ({ status: 0 }));
  assert.equal(main('npm', ['run', 'dev']), 0);
  assert.equal(spawn.mock.calls[1].arguments[2].stdio, 'inherit');
  assert.equal(main('npx', ['pkg', '--flag']), 0);
  assert.deepEqual(spawn.mock.calls[2].arguments[1], ['x', 'pkg', '--flag']);
});

test('fallback runs only when safe and errors never become success', () => {
  mock(console, 'error', () => {});
  mock(detector, 'getBunPath', () => process.execPath);
  const locate = mock(detector, 'locateBinary', () => process.execPath);
  const spawn = mock(cp, 'spawnSync', () => ({ status: 23 }));
  assert.equal(main('npm', ['--version']), 23);
  assert.deepEqual(spawn.mock.calls[0].arguments[1], ['--version']);
  spawn.mock.mockImplementationOnce(() => ({
    status: null,
    error: Object.assign(new Error('gone'), { code: 'ENOENT' }),
  }));
  assert.equal(main('npm', ['install']), 23);
  const before = spawn.mock.calls.length;
  spawn.mock.mockImplementation(() => ({
    status: null,
    error: Object.assign(new Error('buffer full'), { code: 'ENOBUFS' }),
  }));
  assert.equal(main('npm', ['install']), 1);
  assert.equal(spawn.mock.calls.length, before + 1);
  locate.mock.mockImplementation(() => null);
  assert.equal(main('npm', ['publish']), 1);
  assert.equal(main('bad', []), 1);
  assert.equal(exitCode({ status: null, signal: 'SIGTERM' }), 143);
  assert.equal(exitCode({ status: null, signal: 'unknown' }), 129);
  assert.equal(exitCode({ status: null }), 1);
});

test('missing Bun falls back and pre-execution permission failure retries exactly once', () => {
  mock(console, 'error', () => {});
  const bun = mock(detector, 'getBunPath', () => null);
  const original = mock(detector, 'locateBinary', () => process.execPath);
  const spawn = mock(cp, 'spawnSync', () => ({ status: 31 }));
  assert.equal(main('npm', ['install']), 31);
  assert.deepEqual(spawn.mock.calls[0].arguments[1], ['install']);
  original.mock.mockImplementation(() => null);
  assert.equal(main('npm', ['install']), 1);
  bun.mock.mockImplementation(() => process.execPath);
  original.mock.mockImplementation(() => process.execPath);
  spawn.mock.mockImplementationOnce(() => ({
    status: null,
    error: Object.assign(new Error('denied'), { code: 'EACCES' }),
  }));
  assert.equal(main('npm', ['install']), 31);
  assert.equal(spawn.mock.callCount(), 3);
});

test('diagnostics use one bunpm: <component>: <message> stderr convention', () => {
  const lines = [];
  mock(console, 'error', (line) => lines.push(line));
  mock(detector, 'getBunPath', () => null);
  mock(detector, 'locateBinary', () => null);
  // A missing original manager must name the component and stay nonzero.
  assert.equal(main('npm', ['install']), 1);
  // Unsupported invocations surface through the top-level wrapper handler.
  assert.equal(main('bad', []), 1);
  // Pre-execution spawn failures keep the underlying cause text verbatim.
  assert.equal(exitCode({ error: new Error('spawn EPERM') }), 1);
  assert.deepEqual(lines, [
    'bunpm: detector: original npm not found; install npm for this command, or install Bun for supported commands.',
    'bunpm: wrapper: Expected one of: npm, npx, yarn, pnpm',
    'bunpm: exec: spawn EPERM',
  ]);
  for (const line of lines) assert.match(line, /^bunpm: [a-z]+: \S/);
});

test('native child argv preserves metacharacters and exact nonzero exit', () => {
  const args = [
    'space here',
    'a&b',
    '%PATH%',
    '"quoted"',
    '',
    'a|b',
    'line\nbreak',
  ];
  const result = spawnCommand(
    process.execPath,
    [
      '-e',
      'console.log(JSON.stringify(process.argv.slice(1))); process.exitCode=17',
      '--',
      ...args,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 17);
  assert.deepEqual(JSON.parse(result.stdout), args);
  assert.throws(() => spawnCommand('relative', []), /absolute/);
  assert.throws(() => spawnCommand(process.execPath, ['\0']));
});

test(
  'Windows batch fallback preserves safe args and rejects shell injection',
  { skip: process.platform !== 'win32' },
  () => {
    const root = fixture();
    const bin = path.join(root, 'Program Files (x86)');
    fs.mkdirSync(bin);
    const shim = path.join(bin, 'original.cmd');
    fs.writeFileSync(shim, '@echo off\r\necho %~1\r\nexit /b 19\r\n');
    const result = spawnCommand(shim, ['space here'], { encoding: 'utf8' });
    assert.equal(result.status, 19);
    assert.equal(result.stdout.trim(), 'space here');
    const wildcard = spawnCommand(shim, ['*'], { encoding: 'utf8' });
    assert.equal(wildcard.status, 19);
    assert.equal(wildcard.stdout.trim(), '*');
    for (const arg of [
      'x&echo pwn',
      '%PATH%',
      'a"b',
      '!VAR!',
      'a\nb',
      'a^b',
      '(x)',
    ])
      assert.throws(() => spawnCommand(shim, [arg]), /Unsafe batch/);
    // Without SystemRoot/WINDIR there is no trustworthy cmd.exe to run.
    const savedRoots = {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
    };
    delete process.env.SystemRoot;
    delete process.env.WINDIR;
    try {
      assert.throws(() => spawnCommand(shim, ['x']), /SystemRoot is not set/);
    } finally {
      for (const [key, value] of Object.entries(savedRoots))
        if (value !== undefined) process.env[key] = value;
    }
    const cli = path.join(root, 'node_modules', 'npm', 'bin');
    fs.mkdirSync(cli, { recursive: true });
    fs.writeFileSync(
      path.join(cli, 'npm-cli.js'),
      'console.log(JSON.stringify(process.argv.slice(2))); process.exitCode=11',
    );
    const direct = spawnCommand(path.join(root, 'npm.cmd'), ['a&b', '%PATH%'], {
      encoding: 'utf8',
    });
    assert.equal(direct.status, 11);
    assert.deepEqual(JSON.parse(direct.stdout), ['a&b', '%PATH%']);
  },
);
