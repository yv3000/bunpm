const { test, mock: nodeMock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { setImmediate } = require('node:timers');
const detector = require('../bunpm/core/detector');
const { main, spawnCommand, exitCode } = require('../bunpm/core/wrapper');
const {
  mapCommand,
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
  assert.deepEqual(mapCommand('npm', ['i']).bunArgs, ['install']);
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
  assert.equal(detector.locateBinary('pnpm'), null);
  assert.equal(detector.locateBinary('yarn'), fake);
  assert.throws(() => detector.locateBinary('bun & echo'), /Invalid binary/);
  process.env.PATH = '';
  assert.equal(detector.locateBinary('yarn', [bin, fake]), fake);
  assert.equal(
    detector.locateBinary('yarn', [path.join(root, 'missing')]),
    null,
  );
});

test('Bun detection prefers an absolute PATH entry', () => {
  const root = fixture();
  const bun = path.join(root, process.platform === 'win32' ? 'bun.exe' : 'bun');
  fs.writeFileSync(bun, 'fixture', { mode: 0o755 });
  process.env.PATH = root;
  assert.equal(detector.getBunPath(), bun);
});

test('Bun detection falls back to ~/.bun/bin when PATH has none', () => {
  const root = fixture();
  const bin = path.join(root, '.bun', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const bun = path.join(bin, process.platform === 'win32' ? 'bun.exe' : 'bun');
  fs.writeFileSync(bun, 'fixture', { mode: 0o755 });
  // os.homedir() reads HOME on Unix and USERPROFILE on Windows.
  const saved = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
  };
  process.env.HOME = root;
  process.env.USERPROFILE = root;
  process.env.PATH = '';
  try {
    assert.equal(detector.getBunPath(), bun);
  } finally {
    for (const [key, value] of Object.entries(saved))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});

/**
 * A fake ChildProcess with Node's event order: 'spawn', output, both pipes
 * end, then 'close'. Without 'spawn' it fails the way a missing binary does.
 *
 * @param {{ out?: string[], err?: string[], status?: number | null, signal?: string | null, error?: Error, started?: boolean }} [spec]
 */
function fakeChild(spec = {}) {
  const { out = [], err = [], status = 0, signal = null } = spec;
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
  setImmediate(() => {
    if (spec.started !== false) child.emit('spawn');
    if (spec.error) child.emit('error', spec.error);
    for (const chunk of out) child.stdout.write(chunk);
    for (const chunk of err) child.stderr.write(chunk);
    let open = 2;
    const ended = () => --open || child.emit('close', status, signal);
    child.stdout.on('end', ended).end();
    child.stderr.on('end', ended).end();
  });
  return child;
}

/**
 * Capture string writes to a process stream, passing everything else through:
 * node:test reports results over the same streams.
 *
 * @param {NodeJS.WriteStream} stream
 */
function capture(stream) {
  const write = stream.write.bind(stream);
  /** @type {string[]} */
  const writes = [];
  mock(stream, 'write', (chunk, ...rest) =>
    typeof chunk === 'string'
      ? (writes.push(chunk), true)
      : write(chunk, ...rest),
  );
  return writes;
}

test('wrapper streams formatted output and keeps exit codes and interactive stdio', async () => {
  mock(detector, 'getBunPath', () => process.execPath);
  const spawn = mock(cp, 'spawn', () =>
    fakeChild({
      out: ['bun install v1.3.14\n  2 packa', 'ges installed [1ms]\n'],
      err: ['error: no\n'],
      status: 7,
    }),
  );
  const sync = mock(cp, 'spawnSync', () => ({ status: 0 }));
  const out = capture(process.stdout);
  const err = capture(process.stderr);
  assert.equal(await main('npm', ['install']), 7);
  assert.deepEqual(out, ['added 2 packages in 1ms\n']);
  assert.deepEqual(err, ['npm error no\n']);
  const options = spawn.mock.calls[0].arguments[2];
  assert.equal(options.shell, false);
  assert.deepEqual(options.stdio, ['inherit', 'pipe', 'pipe']);
  assert.equal(options.env.npm_execpath, process.execPath);
  assert.equal(options.maxBuffer, undefined);
  // Interactive commands stay synchronous with inherited stdio.
  assert.equal(await main('npm', ['run', 'dev']), 0);
  assert.equal(sync.mock.calls[0].arguments[2].stdio, 'inherit');
  assert.equal(await main('npx', ['pkg', '--flag']), 0);
  assert.deepEqual(sync.mock.calls[1].arguments[1], ['x', 'pkg', '--flag']);
  assert.equal(spawn.mock.callCount(), 1);
  spawn.mock.mockImplementation(() =>
    fakeChild({ status: null, signal: 'SIGTERM' }),
  );
  assert.equal(await main('npm', ['install']), 143);
});

test('streamed lines reach the terminal before Bun exits', async () => {
  mock(detector, 'getBunPath', () => process.execPath);
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
  mock(cp, 'spawn', () => child);
  const out = capture(process.stdout);
  const pending = main('npm', ['install']);
  child.emit('spawn');
  child.stdout.write('  1 package installed [2ms]\n');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(out, ['added 1 package in 2ms\n']);
  child.stdout.end();
  child.stderr.end();
  await new Promise((resolve) => setImmediate(resolve));
  child.emit('close', 0, null);
  assert.equal(await pending, 0);
});

test('output beyond the old 16 MiB buffer streams in full from a real child', async () => {
  const root = fixture();
  // Long lines keep the line count, and so the test time, low.
  const line = `installed a@1 ${'✓'.repeat(1024)}\n`;
  const count = Math.ceil((17 * 1024 * 1024) / Buffer.byteLength(line));
  // Bun's argv is ['install']; with node standing in for Bun, that runs ./install.
  fs.writeFileSync(
    path.join(root, 'install'),
    'const line = ' +
      JSON.stringify(line) +
      '; let left = ' +
      count +
      ';\n' +
      "(function pump() { while (left > 0) { left--; if (!process.stdout.write(line)) return process.stdout.once('drain', pump); } process.exitCode = 7; })();\n",
  );
  mock(detector, 'getBunPath', () => process.execPath);
  const write = process.stdout.write.bind(process.stdout);
  let length = 0;
  mock(process.stdout, 'write', (chunk, ...rest) =>
    typeof chunk === 'string'
      ? ((length += chunk.length), true)
      : write(chunk, ...rest),
  );
  const cwd = process.cwd();
  process.chdir(root);
  try {
    assert.equal(await main('npm', ['install']), 7);
  } finally {
    process.chdir(cwd);
  }
  assert.equal(length, line.replace('installed', 'added').length * count);
});

test('fallback runs only before Bun starts and errors never become success', async () => {
  mock(console, 'error', () => {});
  mock(detector, 'getBunPath', () => process.execPath);
  const locate = mock(detector, 'locateBinary', () => process.execPath);
  const sync = mock(cp, 'spawnSync', () => ({ status: 23 }));
  assert.equal(await main('npm', ['--version']), 23);
  assert.deepEqual(sync.mock.calls[0].arguments[1], ['--version']);
  const gone = Object.assign(new Error('gone'), { code: 'ENOENT' });
  const spawn = mock(cp, 'spawn', () =>
    fakeChild({ started: false, error: gone, status: -2 }),
  );
  // Missing Bun binary: the original manager runs exactly once.
  assert.equal(await main('npm', ['install']), 23);
  assert.equal(sync.mock.callCount(), 2);
  // Any other pre-start failure is reported, not retried.
  const busy = Object.assign(new Error('spawn EAGAIN'), { code: 'EAGAIN' });
  spawn.mock.mockImplementation(() =>
    fakeChild({ started: false, error: busy }),
  );
  assert.equal(await main('npm', ['install']), 1);
  // A failure after Bun started never runs a second manager.
  spawn.mock.mockImplementation(() => fakeChild({ error: gone, status: 0 }));
  assert.equal(await main('npm', ['install']), 1);
  // Not even when the started child reports no exit status.
  spawn.mock.mockImplementation(() => fakeChild({ error: gone, status: null }));
  assert.equal(await main('npm', ['install']), 1);
  assert.equal(sync.mock.callCount(), 2);
  locate.mock.mockImplementation(() => null);
  assert.equal(await main('npm', ['publish']), 1);
  assert.equal(await main('bad', []), 1);
  assert.equal(exitCode({ status: null, signal: 'SIGTERM' }), 143);
  assert.equal(exitCode({ status: null, signal: 'unknown' }), 129);
  assert.equal(exitCode({ status: null }), 1);
});

test('missing Bun falls back and pre-execution permission failure retries exactly once', async () => {
  mock(console, 'error', () => {});
  const bun = mock(detector, 'getBunPath', () => null);
  const original = mock(detector, 'locateBinary', () => process.execPath);
  const sync = mock(cp, 'spawnSync', () => ({ status: 31 }));
  assert.equal(await main('npm', ['install']), 31);
  assert.deepEqual(sync.mock.calls[0].arguments[1], ['install']);
  original.mock.mockImplementation(() => null);
  assert.equal(await main('npm', ['install']), 1);
  bun.mock.mockImplementation(() => process.execPath);
  original.mock.mockImplementation(() => process.execPath);
  const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
  const spawn = mock(cp, 'spawn', () =>
    fakeChild({ started: false, error: denied }),
  );
  assert.equal(await main('npm', ['install']), 31);
  assert.equal(spawn.mock.callCount(), 1);
  assert.equal(sync.mock.callCount(), 2);
  // Interactive commands keep the same one-time retry.
  sync.mock.mockImplementationOnce(() => ({ status: null, error: denied }));
  assert.equal(await main('npm', ['run', 'dev']), 31);
  assert.equal(sync.mock.callCount(), 4);
  // Resolve-time validation surfaces through the wrapper handler.
  bun.mock.mockImplementation(() => 'relative-bun');
  assert.equal(await main('npm', ['install']), 1);
  assert.equal(spawn.mock.callCount(), 1);
});

test('diagnostics use one bunpm: <component>: <message> stderr convention', async () => {
  const lines = [];
  mock(console, 'error', (line) => lines.push(line));
  mock(detector, 'getBunPath', () => null);
  mock(detector, 'locateBinary', () => null);
  // A missing original manager must name the component and stay nonzero.
  assert.equal(await main('npm', ['install']), 1);
  // Unsupported invocations surface through the top-level wrapper handler.
  assert.equal(await main('bad', []), 1);
  // Pre-execution spawn failures keep the underlying cause text verbatim.
  assert.equal(exitCode({ error: new Error('spawn EPERM') }), 1);
  assert.deepEqual(lines, [
    'bunpm: detector: original npm not found; install npm for this command, or install Bun for supported commands.',
    'bunpm: wrapper: Expected one of: npm, npx, yarn, pnpm',
    'bunpm: exec: spawn EPERM',
  ]);
  for (const line of lines) assert.match(line, /^bunpm: [a-z]+: \S/);
});

test('the wrapper entry resolves main() to the process exit code', () => {
  const run = (/** @type {string} */ script, /** @type {string[]} */ args) =>
    cp.spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: '' },
    });
  const direct = run('bunpm/core/wrapper.js', ['bad']);
  assert.equal(direct.status, 1);
  assert.match(direct.stderr, /^bunpm: wrapper: Expected one of/);
  // The installed Windows launchers are exercised by tests/smoke.test.js.
});

test('BUNPM_DEBUG=1 adds one JSON diagnostic line after the human one', () => {
  const lines = [];
  mock(console, 'error', (line) => lines.push(line));
  const error = Object.assign(new Error('spawn bun EACCES'), {
    code: 'EACCES',
  });
  const saved = process.env.BUNPM_DEBUG;
  try {
    process.env.BUNPM_DEBUG = '1';
    assert.equal(exitCode({ error }), 1);
    assert.equal(lines[0], 'bunpm: exec: spawn bun EACCES');
    assert.deepEqual(JSON.parse(lines[1]), {
      level: 'error',
      component: 'exec',
      message: 'spawn bun EACCES',
      code: 'EACCES',
    });
    delete process.env.BUNPM_DEBUG;
    assert.equal(exitCode({ error: new Error('boom') }), 1);
    assert.equal(lines.length, 3);
  } finally {
    if (saved === undefined) delete process.env.BUNPM_DEBUG;
    else process.env.BUNPM_DEBUG = saved;
  }
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
