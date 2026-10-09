const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const detector = require('../bunpm/core/detector');
const { doctor } = require('../bunpm/core/doctor');
const { main } = require('../bunpm/core/wrapper');

/** @type {string[]} */
let out;
/** @type {string[]} */
let err;
const dirs = [];
afterEach(() => {
  mock.restoreAll();
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

/** A launcher folder holding the given files. */
function launchers(names = ['npm', 'npx', 'yarn', 'pnpm']) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-doctor-'));
  dirs.push(dir);
  for (const name of names) {
    fs.writeFileSync(path.join(dir, name), '');
    fs.writeFileSync(path.join(dir, `${name}.cmd`), '');
  }
  return dir;
}

/** @param {{ bun?: string | null }} [setup] */
function setup({ bun = '/opt/bun' } = {}) {
  out = [];
  err = [];
  mock.method(console, 'log', (line) => out.push(line));
  mock.method(console, 'error', (line) => err.push(line));
  mock.method(detector, 'getBunPath', () => bun);
  mock.method(detector, 'locateBinary', (name) =>
    name === 'npm' ? '/usr/bin/npm' : null,
  );
}

const bunOk = () => ({ status: 0, stdout: '1.3.14\n' });

test('doctor reports a healthy setup and exits 0', () => {
  setup();
  const dir = launchers();
  const calls = [];
  const spawn = (/** @type {string} */ bin, /** @type {string[]} */ args) => {
    calls.push([bin, args]);
    return bunOk();
  };
  assert.equal(doctor({ spawn, nodeVersion: '22.22.2', binDir: dir }), 0);
  assert.deepEqual(calls, [['/opt/bun', ['--version']]]);
  assert.deepEqual(err, []);
  assert.deepEqual(out, [
    'ok   node 22.22.2',
    'ok   bun 1.3.14 (/opt/bun)',
    `ok   launchers in ${dir}`,
    'ok   npm /usr/bin/npm',
    'info yarn not found; yarn commands that fall back will fail.',
    'info pnpm not found; pnpm commands that fall back will fail.',
  ]);
});

test('doctor names each failure and exits 1', () => {
  setup({ bun: null });
  const dir = launchers(['npm']);
  assert.equal(doctor({ spawn: bunOk, nodeVersion: '16.8.0', binDir: dir }), 1);
  const missing =
    process.platform === 'win32'
      ? 'npx, npx.cmd, yarn, yarn.cmd, pnpm, pnpm.cmd'
      : 'npx, yarn, pnpm';
  assert.deepEqual(err, [
    'bunpm: doctor: node 16.8.0 is older than 16.9; upgrade Node.js.',
    'bunpm: doctor: bun not found on PATH or in ~/.bun/bin; install it from https://bun.sh.',
    `bunpm: doctor: launchers missing from ${dir}: ${missing}; reinstall bunpm.`,
  ]);
});

test('doctor fails when bun --version does not succeed', () => {
  setup();
  const dir = launchers();
  assert.equal(
    doctor({
      spawn: () => ({ status: 3 }),
      nodeVersion: '17.0.0',
      binDir: dir,
    }),
    1,
  );
  assert.equal(
    doctor({
      spawn: () => ({ status: null, error: new Error('spawn EPERM') }),
      binDir: dir,
    }),
    1,
  );
  assert.deepEqual(err, [
    'bunpm: doctor: /opt/bun --version failed (exit 3); repair your Bun installation.',
    'bunpm: doctor: /opt/bun --version failed (spawn EPERM); repair your Bun installation.',
  ]);
});

test('bunpm doctor runs through the wrapper entry and checks the checkout launchers', async () => {
  setup({ bun: null });
  assert.equal(await main('doctor', []), 1);
  assert.ok(out.some((line) => line.startsWith('ok   launchers in ')));
  assert.match(err[0], /^bunpm: doctor: bun not found/);
});
