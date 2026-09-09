const { test, expect, spyOn, afterEach } = require('bun:test');
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
const mocks = [];
const dirs = [];
const savedEnv = { ...process.env };
function mock(object, key, implementation) {
  const spy = spyOn(object, key).mockImplementation(implementation);
  mocks.push(spy);
  return spy;
}
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-test-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const spy of mocks.splice(0)) spy.mockRestore();
  process.env.PATH = savedEnv.PATH;
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
      expect(mapCommand(tool, args)).toEqual({
        fallbackTo: tool,
        fallbackArgs: args,
      });
    }
    expect(
      mapCommand(tool, ['test', '--', '-D', '', '--filter=x']).bunArgs ?? [],
    ).toEqual(tool === 'pnpm' ? [] : ['run', 'test', '-D', '', '--filter=x']);
    expect(mapCommand(tool, ['run', 'build', '--', '-D', '']).bunArgs).toEqual([
      'run',
      'build',
      '-D',
      '',
    ]);
    expect(mapCommand(tool, ['run', '--help']).fallbackTo).toBe(tool);
  }
  expect(mapCommand('yarn', ['dev']).fallbackTo).toBe('yarn');
  expect(mapCommand('yarn', ['global', 'remove', 'pkg']).fallbackTo).toBe(
    'yarn',
  );
  expect(mapCommand('yarn', ['global', 'add', 'pkg']).bunArgs).toEqual([
    'add',
    '-g',
    'pkg',
  ]);
  expect(
    mapCommand('npm', ['install', '--registry', 'https://example.test'])
      .bunArgs,
  ).toEqual(['install', '--registry', 'https://example.test']);
  expect(mapCommand('npm', ['install', '--registry']).fallbackTo).toBe('npm');
  expect(mapCommand('npm', []).fallbackTo).toBe('npm');
  expect(mapCommand('pnpm', []).bunArgs).toEqual(['install']);
  expect(mapCommand('npx', []).fallbackTo).toBe('npx');
  expect(mapCommand('npx', ['--version']).fallbackTo).toBe('npx');
  expect(mapCommand('yarn', ['dlx']).fallbackTo).toBe('yarn');
  expect(mapCommand('npm', ['add', '--', '-pkg']).bunArgs).toEqual([
    'add',
    '--',
    '-pkg',
  ]);
  expect(
    translateFlags(['--save', '--registry=x', '--', '-D', ''], {
      '--save': '',
      '--registry': '--registry',
      '-D': '-d',
    }),
  ).toEqual(['--registry=x', '--', '-D', '']);
  expect(hasNonFlagArgs(['--registry', 'x', 'pkg'])).toBe(true);
  expect(mapNpmCommand(['i']).bunArgs).toEqual(['install']);
  expect(mapYarnCommand([]).bunArgs).toEqual(['install']);
  expect(mapPnpmCommand([]).bunArgs).toEqual(['install']);
  for (const args of [null, {}, [3], ['a\0b']])
    expect(() => mapCommand('npm', args)).toThrow('Arguments');
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
  expect(detector.getYarnPath()).toBe(fake);
  expect(detector.getPnpmPath()).toBeNull();
  expect(detector.locateBinary('yarn')).toBe(fake);
  expect(() => detector.locateBinary('bun & echo')).toThrow('Invalid binary');
  process.env.PATH = '';
  expect(detector.locateBinary('yarn', [bin, fake])).toBe(fake);
  expect(
    detector.locateBinary('yarn', [path.join(root, 'missing')]),
  ).toBeNull();
});

test('Bun detection and version failures use direct argument arrays', () => {
  const root = fixture();
  const bun = path.join(root, process.platform === 'win32' ? 'bun.exe' : 'bun');
  fs.writeFileSync(bun, 'fixture', { mode: 0o755 });
  process.env.PATH = root;
  expect(detector.isBunAvailable()).toBe(true);
  expect(detector.getBunPath()).toBe(bun);
  expect(detector.getBunxPath()).toBe(bun);
  const bunx = path.join(
    root,
    process.platform === 'win32' ? 'bunx.exe' : 'bunx',
  );
  fs.writeFileSync(bunx, 'fixture', { mode: 0o755 });
  expect(detector.getBunxPath()).toBe(bunx);
  const spawn = mock(cp, 'spawnSync', () => ({
    status: 0,
    stdout: '1.3.14\n',
  }));
  expect(detector.getBunVersion()).toBe('1.3.14');
  expect(spawn.mock.calls[0][1]).toEqual(['--version']);
  spawn.mockImplementation(() => ({ status: 1, stdout: '' }));
  expect(detector.getBunVersion()).toBeNull();
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
  expect(main('npm', ['install'])).toBe(7);
  expect(out).toHaveBeenCalledWith('added 2 packages in 1ms\n');
  expect(err).toHaveBeenCalledWith('npm error no\n');
  expect(spawn.mock.calls[0][2].shell).toBe(false);
  spawn.mockImplementation(() => ({ status: 0 }));
  expect(main('npm', ['run', 'dev'])).toBe(0);
  expect(spawn.mock.calls[1][2].stdio).toBe('inherit');
  expect(main('npx', ['pkg', '--flag'])).toBe(0);
  expect(spawn.mock.calls[2][1]).toEqual(['x', 'pkg', '--flag']);
});

test('fallback runs only when safe and errors never become success', () => {
  mock(console, 'error', () => {});
  mock(detector, 'getBunPath', () => process.execPath);
  const locate = mock(detector, 'locateBinary', () => process.execPath);
  const spawn = mock(cp, 'spawnSync', () => ({ status: 23 }));
  expect(main('npm', ['--version'])).toBe(23);
  expect(spawn.mock.calls[0][1]).toEqual(['--version']);
  spawn.mockImplementationOnce(() => ({
    status: null,
    error: Object.assign(new Error('gone'), { code: 'ENOENT' }),
  }));
  expect(main('npm', ['install'])).toBe(23);
  const before = spawn.mock.calls.length;
  spawn.mockImplementation(() => ({
    status: null,
    error: Object.assign(new Error('buffer full'), { code: 'ENOBUFS' }),
  }));
  expect(main('npm', ['install'])).toBe(1);
  expect(spawn.mock.calls.length).toBe(before + 1);
  locate.mockImplementation(() => null);
  expect(main('npm', ['publish'])).toBe(1);
  expect(main('bad', [])).toBe(1);
  expect(exitCode({ status: null, signal: 'SIGTERM' })).toBe(143);
  expect(exitCode({ status: null, signal: 'unknown' })).toBe(129);
  expect(exitCode({ status: null })).toBe(1);
});

test('missing Bun falls back and pre-execution permission failure retries exactly once', () => {
  mock(console, 'error', () => {});
  const bun = mock(detector, 'getBunPath', () => null);
  const original = mock(detector, 'locateBinary', () => process.execPath);
  const spawn = mock(cp, 'spawnSync', () => ({ status: 31 }));
  expect(main('npm', ['install'])).toBe(31);
  expect(spawn.mock.calls[0][1]).toEqual(['install']);
  original.mockImplementation(() => null);
  expect(main('npm', ['install'])).toBe(1);
  bun.mockImplementation(() => process.execPath);
  original.mockImplementation(() => process.execPath);
  spawn.mockImplementationOnce(() => ({
    status: null,
    error: Object.assign(new Error('denied'), { code: 'EACCES' }),
  }));
  expect(main('npm', ['install'])).toBe(31);
  expect(spawn).toHaveBeenCalledTimes(3);
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
  expect(result.status).toBe(17);
  expect(JSON.parse(result.stdout)).toEqual(args);
  expect(() => spawnCommand('relative', [])).toThrow('absolute');
  expect(() => spawnCommand(process.execPath, ['\0'])).toThrow();
});

test.skipIf(process.platform !== 'win32')(
  'Windows batch fallback preserves safe args and rejects shell injection',
  () => {
    const root = fixture();
    const shim = path.join(root, 'original.cmd');
    fs.writeFileSync(shim, '@echo off\r\necho %~1\r\nexit /b 19\r\n');
    const result = spawnCommand(shim, ['space here'], { encoding: 'utf8' });
    expect(result.status).toBe(19);
    expect(result.stdout.trim()).toBe('space here');
    for (const arg of [
      'x&echo pwn',
      '%PATH%',
      'a"b',
      '!VAR!',
      'a\nb',
      'a^b',
      '(x)',
    ])
      expect(() => spawnCommand(shim, [arg])).toThrow('Unsafe batch');
    const cli = path.join(root, 'node_modules', 'npm', 'bin');
    fs.mkdirSync(cli, { recursive: true });
    fs.writeFileSync(
      path.join(cli, 'npm-cli.js'),
      'console.log(JSON.stringify(process.argv.slice(2))); process.exitCode=11',
    );
    const direct = spawnCommand(path.join(root, 'npm.cmd'), ['a&b', '%PATH%'], {
      encoding: 'utf8',
    });
    expect(direct.status).toBe(11);
    expect(JSON.parse(direct.stdout)).toEqual(['a&b', '%PATH%']);
  },
);
