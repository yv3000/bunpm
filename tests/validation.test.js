// Trust-boundary validation: every function that takes untrusted input fails
// closed before anything is spawned or downloaded.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  VALID_MANAGERS,
  INPUT_VALIDATION_PATTERNS,
  input_validation_patterns,
  validateArgs,
  validateManager,
  validateBinary,
  validateUrl,
} = require('../bunpm/core/validate');
const { mapCommand } = require('../bunpm/core/mapper');
const { spawnCommand } = require('../bunpm/core/wrapper');
const { locateBinary } = require('../bunpm/core/detector');
const { doctor } = require('../bunpm/core/doctor');
const bootstrap = require('../bunpm/bootstrap');

const ARGS = /^Arguments must be an array of strings without NUL bytes$/;
const sha = 'a'.repeat(40);
const good = `https://raw.githubusercontent.com/yv3000/bunpm/${sha}/bunpm/core/mapper.js`;

describe('trust-boundary validation', () => {
  test('INPUT_VALIDATION_PATTERNS exports frozen schemas for static audits', () => {
    assert.deepEqual(VALID_MANAGERS, ['npm', 'npx', 'yarn', 'pnpm']);
    assert.ok(Object.isFrozen(VALID_MANAGERS));
    assert.ok(Object.isFrozen(INPUT_VALIDATION_PATTERNS));
    assert.equal(input_validation_patterns, INPUT_VALIDATION_PATTERNS);
    assert.ok(Array.isArray(input_validation_patterns));
    assert.equal(input_validation_patterns.length, 5);
    assert.ok(INPUT_VALIDATION_PATTERNS.manager.test('npm'));
    assert.ok(INPUT_VALIDATION_PATTERNS.safeString.test('safe'));
    assert.ok(INPUT_VALIDATION_PATTERNS.commitSha.test(sha));
    assert.ok(
      INPUT_VALIDATION_PATTERNS.githubPath.test(
        `/yv3000/bunpm/${sha}/bunpm/core/`,
      ),
    );
  });

  test('validateArgs accepts string arrays, including empty and unusual text', () => {
    for (const args of [
      [],
      ['install'],
      ['a b', '--x=1', '"quoted"', 'line\nbreak', 'ünï'],
    ])
      assert.doesNotThrow(() => validateArgs(args));
  });

  test('validateArgs rejects non-arrays, non-strings and NUL bytes', () => {
    for (const value of [
      undefined,
      null,
      'install',
      42,
      { 0: 'install', length: 1 },
      [undefined],
      new Array(1),
      Object.assign(new Array(3), { 0: 'install', 2: 'package' }),
      [null],
      [1],
      [['nested']],
      ['ok', 'bad\0arg'],
      ['\0'],
    ])
      assert.throws(() => validateArgs(value), {
        name: 'TypeError',
        message: ARGS,
      });
  });

  test('validateManager accepts valid managers and rejects unsupported names', () => {
    for (const name of VALID_MANAGERS)
      assert.doesNotThrow(() => validateManager(name));
    for (const name of ['', 'bun', 'NPM', 'npm ', 'npm\0', undefined, 123])
      assert.throws(() => validateManager(/** @type {any} */ (name)), {
        name: 'TypeError',
        message: 'Expected one of: npm, npx, yarn, pnpm',
      });
  });

  test('mapCommand rejects unknown or empty manager names before mapping', () => {
    for (const name of ['', 'bun', 'NPM', 'npm ', 'npm\0', undefined])
      assert.throws(() => mapCommand(/** @type {any} */ (name), []), {
        name: 'TypeError',
        message: 'Expected one of: npm, npx, yarn, pnpm',
      });
    assert.throws(() => mapCommand('npm', ['install', 'a\0b']), {
      message: ARGS,
    });
  });

  test('validateBinary rejects relative, empty or NUL-containing executables', () => {
    for (const binary of [
      '',
      'bun',
      './bun',
      path.join('rel', 'bun'),
      path.resolve('bun') + '\0',
      null,
      undefined,
    ])
      assert.throws(() => validateBinary(binary), {
        name: 'TypeError',
        message: 'Expected an absolute executable path',
      });
    assert.doesNotThrow(() => validateBinary(process.execPath));
  });

  test('validateUrl accepts only this repository at a commit over HTTPS', () => {
    assert.equal(validateUrl(good).href, good);
    for (const url of [
      'javascript:alert(1)',
      'data:text/plain,x',
      'file:///etc/passwd',
      'ftp://raw.githubusercontent.com/x',
      'http://raw.githubusercontent.com/yv3000/bunpm/' + sha + '/bunpm/x',
      good.replace('https://', 'https://raw.githubusercontent.com.evil.test/'),
    ])
      assert.throws(() => validateUrl(url), {
        name: 'TypeError',
        message: /^Unsafe download URL: /,
      });
    // Protocol-relative, relative and empty input are not URLs at all.
    for (const url of [
      '//raw.githubusercontent.com/yv3000/bunpm/',
      '/yv3000/bunpm/',
      '',
    ])
      assert.throws(() => validateUrl(url), { name: 'TypeError' });
  });

  test('URL guards reject non-URL objects without calling coercion hooks', () => {
    for (const guard of [validateUrl, bootstrap.validateUrl]) {
      let coerced = false;
      const object = {
        toString() {
          coerced = true;
          return good;
        },
      };
      for (const value of [object, [good], null, undefined, 1, true])
        assert.throws(() => guard(value), TypeError);
      assert.equal(coerced, false);
      assert.equal(guard(good).href, good);
      assert.equal(guard(new URL(good)).href, good);
    }
  });

  test('spawnCommand refuses relative, empty or NUL-containing executables', () => {
    for (const binary of [
      '',
      'bun',
      './bun',
      path.join('rel', 'bun'),
      path.resolve('bun') + '\0',
    ])
      assert.throws(() => spawnCommand(binary, []), {
        name: 'TypeError',
        message: 'Expected an absolute executable path',
      });
    assert.throws(() => spawnCommand(process.execPath, ['a\0b']), {
      message: ARGS,
    });
  });

  test('locateBinary refuses names that could escape PATH lookup', () => {
    for (const name of [
      '',
      '../npm',
      'npm/../x',
      'np m',
      'npm;rm',
      '-npm',
      'npm\0',
    ])
      assert.throws(() => locateBinary(name), {
        name: 'TypeError',
        message: 'Invalid binary name',
      });
  });

  test('bootstrap entry point rejects malformed arguments arrays', async () => {
    for (const bad of [
      null,
      'bad',
      42,
      ['\0'],
      new Array(2),
      Object.assign(new Array(3), { 0: '--revision', 2: sha }),
    ]) {
      assert.throws(() => bootstrap.validateArgs(bad), {
        name: 'TypeError',
        message: ARGS,
      });
      await assert.rejects(bootstrap.main(bad), {
        name: 'TypeError',
        message: ARGS,
      });
    }
    assert.throws(() => bootstrap.validateArgs(undefined), {
      name: 'TypeError',
      message: ARGS,
    });
  });

  test('doctor entry point rejects invalid spawn parameter', () => {
    for (const bad of [null, undefined, 123, 'spawn']) {
      assert.throws(
        () =>
          doctor({
            spawn: /** @type {any} */ (bad),
          }),
        {
          name: 'TypeError',
          message: 'Expected spawn to be a function',
        },
      );
    }
  });

  test('all exported validators throw TypeError on malformed input boundaries', () => {
    assert.throws(() => validateArgs(null), { name: 'TypeError' });
    assert.throws(() => validateArgs(['bad\0']), { name: 'TypeError' });
    assert.throws(() => validateManager('invalid-mgr'), { name: 'TypeError' });
    assert.throws(() => validateBinary('relative/path'), { name: 'TypeError' });
    assert.throws(() => validateBinary(path.resolve('bun') + '\0'), {
      name: 'TypeError',
    });
    assert.throws(() => validateUrl('http://insecure.test'), {
      name: 'TypeError',
    });
    assert.throws(() => validateUrl('not-a-url'), { name: 'TypeError' });
    assert.throws(() => bootstrap.validateUrl('http://insecure.test'), {
      name: 'TypeError',
    });
  });
});
