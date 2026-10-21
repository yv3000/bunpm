const { describe, test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const {
  LOG_LEVELS,
  log,
  logger,
  formatDiagnostic,
} = require('../bunpm/core/log');
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

/**
 * Keys and types every JSON diagnostic line must have.
 *
 * @param {string} line
 * @param {string} [expectedLevel]
 */
function assertSchema(line, expectedLevel) {
  const record = JSON.parse(line);
  assert.deepEqual(
    Object.keys(record).sort(),
    [
      'code',
      'component',
      'level',
      'message',
      'module',
      'scope',
      'timestamp',
      'ts',
    ].sort(),
  );
  assert.equal(new Date(record.ts).toISOString(), record.ts);
  assert.equal(record.timestamp, record.ts);
  assert.equal(record.scope, record.component);
  assert.equal(record.module, record.component);
  if (expectedLevel) {
    assert.equal(record.level, expectedLevel);
  } else {
    assert.ok(['error', 'warn', 'info', 'debug'].includes(record.level));
  }
  assert.match(record.component, /^[a-z]+$/);
  assert.equal(typeof record.message, 'string');
  if (record.code !== null) {
    assert.match(record.code, /^E[A-Z]+$/);
  } else {
    assert.equal(record.code, null);
  }
  return record;
}

describe('diagnostic logging', () => {
  test('the frozen level contract matches emitted diagnostics', () => {
    assert.deepEqual(LOG_LEVELS, ['error', 'warn', 'info', 'debug']);
    assert.ok(Object.isFrozen(LOG_LEVELS));
    assert.ok(Object.isFrozen(logger));
    process.env.BUNPM_DEBUG = '1';
    const lines = capture(() => {
      for (const level of LOG_LEVELS)
        logger[level]('wrapper', 'diagnostic', 'EIO');
    });
    assert.equal(lines.length, 8);
    for (const [index, level] of LOG_LEVELS.entries()) {
      assert.equal(lines[index * 2], 'bunpm: wrapper: diagnostic');
      const record = assertSchema(lines[index * 2 + 1], level);
      assert.equal(record.message, 'diagnostic');
      assert.equal(record.code, 'EIO');
    }
  });

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
    const record = assertSchema(lines[1], 'error');
    assert.deepEqual(
      { ...record, timestamp: undefined, ts: undefined },
      {
        ts: undefined,
        timestamp: undefined,
        level: 'error',
        scope: 'exec',
        component: 'exec',
        module: 'exec',
        message: 'spawn bun EACCES',
        code: 'EACCES',
      },
    );
    // No code: code is null rather than omitted.
    assert.equal(
      assertSchema(capture(() => log('wrapper', 'boom'))[1]).code,
      null,
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
      const record = assertSchema(json, 'error');
      assert.equal(record.component, component);
      assert.equal(record.scope, component);
      assert.equal(record.module, component);
      assert.equal(human, `bunpm: ${component}: ${record.message}`);
    });

  test('formatDiagnostic creates a schema-valid diagnostic record', () => {
    const record = formatDiagnostic('wrapper', 'something failed', 'ENOENT');
    assert.equal(record.level, 'error');
    assert.equal(record.scope, 'wrapper');
    assert.equal(record.component, 'wrapper');
    assert.equal(record.module, 'wrapper');
    assert.equal(record.message, 'something failed');
    assert.equal(record.code, 'ENOENT');
    assert.equal(new Date(record.ts).toISOString(), record.ts);
    assert.equal(record.timestamp, record.ts);
    const withoutCode = formatDiagnostic('doctor', 'no code');
    assert.equal(withoutCode.code, null);
  });

  test('logger methods and formatDiagnostic emit valid records across log levels', () => {
    process.env.BUNPM_DEBUG = '1';
    const errRecord = formatDiagnostic(
      'doctor',
      'disk full',
      'ENOSPC',
      'error',
    );
    assert.equal(errRecord.level, 'error');
    assertSchema(JSON.stringify(errRecord), 'error');

    const infoRecord = formatDiagnostic(
      'wrapper',
      'starting child',
      undefined,
      'info',
    );
    assert.equal(infoRecord.level, 'info');
    assertSchema(JSON.stringify(infoRecord), 'info');

    const warnRecord = formatDiagnostic(
      'wrapper',
      'fallback used',
      undefined,
      'warn',
    );
    assert.equal(warnRecord.level, 'warn');
    assertSchema(JSON.stringify(warnRecord), 'warn');

    const lines = capture(() => logger.info('wrapper', 'forwarding to bun'));
    assert.equal(lines[0], 'bunpm: wrapper: forwarding to bun');
    const parsed = assertSchema(lines[1], 'info');
    assert.equal(parsed.level, 'info');
    assert.equal(parsed.message, 'forwarding to bun');

    const warnLines = capture(() => logger.warn('wrapper', 'unsupported flag'));
    assert.equal(warnLines[0], 'bunpm: wrapper: unsupported flag');
    assert.equal(assertSchema(warnLines[1], 'warn').level, 'warn');

    const errLines = capture(() =>
      logger.error('doctor', 'failed check', 'ENOENT'),
    );
    assert.equal(errLines[0], 'bunpm: doctor: failed check');
    assert.equal(assertSchema(errLines[1], 'error').level, 'error');

    const debugLines = capture(() => logger.debug('detector', 'checking PATH'));
    assert.equal(debugLines[0], 'bunpm: detector: checking PATH');
    assert.equal(assertSchema(debugLines[1], 'debug').level, 'debug');
  });

  test('every emitted debug line contains all five canonical keys', () => {
    process.env.BUNPM_DEBUG = '1';
    for (const level of LOG_LEVELS) {
      const lines = capture(() => logger[level]('wrapper', 'queryable event'));
      assert.equal(lines.length, 2);
      const parsed = JSON.parse(lines[1]);
      for (const key of ['timestamp', 'level', 'module', 'message', 'code']) {
        assert.ok(key in parsed, `missing key: ${key}`);
      }
      assert.equal(parsed.code, null);
    }
  });
});
