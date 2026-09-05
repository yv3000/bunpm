// core/errors.test.js
// Unit tests for core/errors.js — run with `bun test core/`.
// The point of these tests is the CONTRACT: a stable code, a real message,
// and a factory for every code. Tools that wrap bunpm branch on the code,
// so a silently renamed or missing code is a breaking change.

const { describe, it, expect } = require('bun:test');

const { BunpmError, CODES } = require('./errors');

// One entry per factory: [label, invocation, expected code].
// The last test in this file asserts this list covers CODES exactly, so
// adding a code without a factory (or vice versa) fails the suite.
const FACTORIES = [
  ['bunNotFound', () => BunpmError.bunNotFound('npm'), CODES.BUN_NOT_FOUND],
  [
    'unsupportedCommand',
    () => BunpmError.unsupportedCommand('publish --dry-run', 'npm'),
    CODES.UNSUPPORTED_COMMAND,
  ],
  ['unsupportedPlatform', () => BunpmError.unsupportedPlatform('aix'), CODES.UNSUPPORTED_PLATFORM],
  ['spawnError', () => BunpmError.spawnError('/usr/bin/bun', 'EACCES'), CODES.SPAWN_ERROR],
];

describe('BunpmError', () => {
  it('is both a BunpmError and a real Error', () => {
    const err = BunpmError.bunNotFound('npm');
    expect(err).toBeInstanceOf(BunpmError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BunpmError');
  });

  it('carries a stack trace', () => {
    expect(typeof BunpmError.bunNotFound('npm').stack).toBe('string');
  });

  it('can be constructed directly with an arbitrary code', () => {
    const err = new BunpmError('CUSTOM_CODE', 'custom message');
    expect(err.code).toBe('CUSTOM_CODE');
    expect(err.message).toBe('custom message');
  });

  it('exposes the code table as a static property', () => {
    expect(BunpmError.codes).toBe(CODES);
  });

  it('freezes the code table so typos cannot invent new codes', () => {
    expect(Object.isFrozen(CODES)).toBe(true);
  });

  it('uses each code name as its own value, so codes cannot drift', () => {
    for (const [name, value] of Object.entries(CODES)) {
      expect(value).toBe(name);
    }
  });
});

describe('BunpmError factories', () => {
  it('BunpmError.bunNotFound() reports BUN_NOT_FOUND', () => {
    expect(BunpmError.bunNotFound('npm').code).toBe('BUN_NOT_FOUND');
  });

  for (const [label, make, expectedCode] of FACTORIES) {
    describe(`BunpmError.${label}()`, () => {
      it(`sets code ${expectedCode}`, () => {
        expect(make().code).toBe(expectedCode);
      });

      it('produces a non-empty message', () => {
        const message = make().message;
        expect(typeof message).toBe('string');
        expect(message.trim().length).toBeGreaterThan(0);
      });

      it('does not leak the code into the message text', () => {
        // The code is printed separately as "CODE: message"; repeating it
        // inside the message would double it up in user-facing output.
        expect(make().message).not.toContain(expectedCode);
      });
    });
  }

  it('includes the offending binary name in bunNotFound()', () => {
    expect(BunpmError.bunNotFound('yarn').message).toContain('yarn');
    expect(BunpmError.bunNotFound('yarn').message).toContain('https://bun.sh');
  });

  it('includes the rejected command and binary in unsupportedCommand()', () => {
    const message = BunpmError.unsupportedCommand('publish --dry-run', 'npm').message;
    expect(message).toContain('publish --dry-run');
    expect(message).toContain('npm');
  });

  it('includes the raw platform string in unsupportedPlatform()', () => {
    const message = BunpmError.unsupportedPlatform('aix').message;
    expect(message).toContain('aix');
    expect(message).toContain('Windows, macOS, Linux');
  });

  it('includes the binary path and the underlying reason in spawnError()', () => {
    const message = BunpmError.spawnError('/usr/bin/bun', 'EACCES').message;
    expect(message).toContain('/usr/bin/bun');
    expect(message).toContain('EACCES');
  });

  it('has exactly one factory per declared code', () => {
    const covered = FACTORIES.map(([, , code]) => code).sort();
    expect(covered).toEqual(Object.values(CODES).sort());
  });
});
