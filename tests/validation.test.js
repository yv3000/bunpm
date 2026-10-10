// Trust-boundary validation: every function that takes untrusted input fails
// closed before anything is spawned or downloaded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { validateArgs, mapCommand } = require('../bunpm/core/mapper');
const { validateUrl } = require('../bunpm/bootstrap');
const { spawnCommand } = require('../bunpm/core/wrapper');
const { locateBinary } = require('../bunpm/core/detector');

const ARGS = /^Arguments must be an array of strings without NUL bytes$/;
const sha = 'a'.repeat(40);
const good = `https://raw.githubusercontent.com/yv3000/bunpm/${sha}/bunpm/core/mapper.js`;

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
