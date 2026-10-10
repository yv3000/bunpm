const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const { log } = require('../bunpm/core/log');
const { exitCode } = require('../bunpm/core/wrapper');

const saved = process.env.BUNPM_DEBUG;
afterEach(() => {
  mock.restoreAll();
  if (saved === undefined) delete process.env.BUNPM_DEBUG;
  else process.env.BUNPM_DEBUG = saved;
});

/** @param {() => void} run */
function capture(run) {
  /** @type {string[]} */
  const lines = [];
  mock.method(console, 'error', (/** @type {string} */ line) =>
    lines.push(line),
  );
  run();
  return lines;
}

/** Keys and types every JSON diagnostic line must have. */
function assertSchema(/** @type {string} */ line) {
  const record = JSON.parse(line);
  assert.deepEqual(
    Object.keys(record).filter((key) => key !== 'code'),
    ['timestamp', 'level', 'component', 'message'],
  );
  assert.equal(new Date(record.timestamp).toISOString(), record.timestamp);
  assert.equal(record.level, 'error');
  assert.match(record.component, /^[a-z]+$/);
  assert.equal(typeof record.message, 'string');
  if ('code' in record) assert.match(record.code, /^E[A-Z]+$/);
  return record;
}

test('without BUNPM_DEBUG a failure is exactly one human line', () => {
  delete process.env.BUNPM_DEBUG;
  assert.deepEqual(
    capture(() => log('doctor', 'bun not found')),
    ['bunpm: doctor: bun not found'],
  );
  // Only the exact value 1 enables JSON.
  process.env.BUNPM_DEBUG = 'true';
  assert.equal(capture(() => log('doctor', 'x')).length, 1);
});

test('BUNPM_DEBUG=1 adds one schema-valid JSON line after the human one', () => {
  process.env.BUNPM_DEBUG = '1';
  const error = Object.assign(new Error('spawn bun EACCES'), {
    code: 'EACCES',
  });
  const lines = capture(() => assert.equal(exitCode({ error }), 1));
  assert.equal(lines[0], 'bunpm: exec: spawn bun EACCES');
  const record = assertSchema(lines[1]);
  assert.deepEqual(
    { ...record, timestamp: undefined },
    {
      timestamp: undefined,
      level: 'error',
      component: 'exec',
      message: 'spawn bun EACCES',
      code: 'EACCES',
    },
  );
  // No code: the key is left out rather than null.
  assert.equal(
    'code' in assertSchema(capture(() => log('wrapper', 'boom'))[1]),
    false,
  );
});

for (const [script, args, component] of [
  ['bunpm/core/wrapper.js', ['bad'], 'wrapper'],
  // bootstrap cannot import log.js, so its inline copy must match the schema.
  ['bunpm/bootstrap.js', [], 'bootstrap'],
])
  test(`${script} emits the same JSON line from a real process`, () => {
    const result = cp.spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      env: { ...process.env, BUNPM_DEBUG: '1' },
    });
    assert.equal(result.status, 1);
    const [human, json] = result.stderr.trim().split(/\r?\n/);
    assert.match(human, new RegExp(`^bunpm: ${component}: \\S`));
    const record = assertSchema(json);
    assert.equal(record.component, component);
    assert.equal(human, `bunpm: ${component}: ${record.message}`);
  });
