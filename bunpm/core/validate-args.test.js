const { describe, it, expect } = require('bun:test');
const { BunpmError } = require('./errors.js');
const { validateArgs } = require('./validate-args.js');

describe('validateArgs', () => {
  it('accepts supported names and preserves arguments', () => {
    expect(validateArgs('npm', ['install', 'express']))
      .toEqual({ invokedAs: 'npm', args: ['install', 'express'] });
    expect(validateArgs('yarn', [])).toEqual({ invokedAs: 'yarn', args: [] });
    expect(validateArgs('npx', ['tool'])).toEqual({ invokedAs: 'npx', args: ['tool'] });
  });

  it('normalizes missing or non-array arguments', () => {
    for (const args of [undefined, null, 'install', 42, {}]) {
      expect(validateArgs('pnpm', args)).toEqual({ invokedAs: 'pnpm', args: [] });
    }
  });

  it('rejects unknown or missing names with a typed error', () => {
    for (const name of ['bun', '', null, undefined, 'NPM']) {
      expect(() => validateArgs(name, ['add'])).toThrow(BunpmError);
      expect(() => validateArgs(name, [])).toThrow(
        expect.objectContaining({ code: 'INVALID_INVOCATION' })
      );
    }
  });

  it('accepts the length boundary and rejects overlong or non-string arguments', () => {
    const args = ['install', 'x'.repeat(4096)];
    expect(validateArgs('npm', args).args).toBe(args);
    for (const arg of ['x'.repeat(4097), 'x'.repeat(5000), null, 42, {}]) {
      expect(() => validateArgs('npm', ['install', arg])).toThrow(BunpmError);
      expect(() => validateArgs('npm', [arg])).toThrow(
        expect.objectContaining({ code: 'INVALID_INVOCATION' })
      );
    }
    expect(() => validateArgs('npm', Array(1))).toThrow(BunpmError);
  });
});
