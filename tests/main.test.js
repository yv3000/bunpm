// main(): streamed output, signal forwarding, fallback and exit codes.
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
const { main, exitCode } = require('../bunpm/core/wrapper');
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

test('SIGINT and SIGTERM reach the streamed Bun child and handlers are removed', async () => {
  mock(detector, 'getBunPath', () => process.execPath);
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: (/** @type {string} */ signal) => sent.push(signal),
  });
  /** @type {string[]} */
  const sent = [];
  mock(cp, 'spawn', () => child);
  const before = ['SIGINT', 'SIGTERM'].map((s) => process.listenerCount(s));
  const pending = main('npm', ['install']);
  child.emit('spawn');
  process.emit('SIGINT', 'SIGINT');
  process.emit('SIGTERM', 'SIGTERM');
  assert.deepEqual(sent, ['SIGINT', 'SIGTERM']);
  child.stdout.end();
  child.stderr.end();
  await new Promise((resolve) => setImmediate(resolve));
  child.emit('close', null, 'SIGINT');
  assert.equal(await pending, 130);
  assert.deepEqual(
    ['SIGINT', 'SIGTERM'].map((s) => process.listenerCount(s)),
    before,
  );
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
