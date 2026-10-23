const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertCliArgs,
  assertHttpsUrl,
  assertSafeEnv,
  input_validation_patterns,
  INPUT_VALIDATION_PATTERNS,
} = require('../bunpm/core/schema');

const sha = '0123456789abcdef0123456789abcdef01234567';

test.describe('trust boundary schema assertions', () => {
  test('assertCliArgs validates argument boundaries strictly', () => {
    assert.doesNotThrow(() => assertCliArgs(['install', '--save-dev']));
    assert.doesNotThrow(() => assertCliArgs([]));
    assert.throws(() => assertCliArgs(null), TypeError);
    assert.throws(() => assertCliArgs(['valid', 123]), TypeError);
    assert.throws(() => assertCliArgs(['nul\0byte']), TypeError);
  });

  test('assertHttpsUrl validates remote revision download URLs', () => {
    const valid = `https://raw.githubusercontent.com/yv3000/bunpm/${sha}/bunpm/core/wrapper.js`;
    const url = assertHttpsUrl(valid);
    assert.equal(url.hostname, 'raw.githubusercontent.com');

    assert.throws(
      () => assertHttpsUrl('http://raw.githubusercontent.com/yv3000/bunpm/x'),
      TypeError,
    );
    assert.throws(() => assertHttpsUrl('https://evil.com/malicious'), TypeError);
    assert.throws(
      () =>
        assertHttpsUrl(
          `https://raw.githubusercontent.com/yv3000/bunpm/${sha}/bunpm/../evil.js`,
        ),
      TypeError,
    );
  });

  test('assertSafeEnv guards environment variable keys and content', () => {
    assert.equal(assertSafeEnv('BUNPM_DEBUG', '1'), '1');
    assert.equal(assertSafeEnv('PATH', 'C:\\Windows\\system32'), 'C:\\Windows\\system32');
    assert.throws(() => assertSafeEnv('KEY\0', 'val'), TypeError);
    assert.throws(() => assertSafeEnv('KEY', null), TypeError);
    assert.throws(() => assertSafeEnv('KEY', 'val\0evil'), TypeError);
  });

  test('schema module exports canonical validation patterns', () => {
    assert.equal(input_validation_patterns, INPUT_VALIDATION_PATTERNS);
    assert.ok(input_validation_patterns.manager.test('npm'));
    assert.ok(input_validation_patterns.commitSha.test(sha));
  });
});
