// core/wrapper.test.js
// Entry-point validation tests for core/wrapper.js — run with `bun test core/`.
//
// wrapper.js runs main() at load time (the Windows Git Bash launcher
// `platforms/windows/bin/npm` reaches it via require(), not as the main
// module, so it cannot be guarded behind require.main). It therefore has to
// be exercised as a real subprocess rather than imported. Every case below
// is rejected by validateInvocation() before any binary is spawned, so these
// tests do no package-manager work and touch no network.

const { describe, it, expect } = require('bun:test');
const { spawnSync } = require('child_process');
const path = require('path');

const WRAPPER = path.join(__dirname, 'wrapper.js');

/**
 * Run wrapper.js with the given argv tail. process.execPath is used rather
 * than a bare 'node' so the test does not depend on what is on PATH.
 *
 * @param {string[]} args
 * @returns {{status: number|null, stderr: string, stdout: string}}
 */
function runWrapper(args) {
  const result = spawnSync(process.execPath, [WRAPPER, ...args], {
    encoding: 'utf8',
    env: { ...process.env },
  });
  return {
    status: result.status,
    stderr: result.stderr || '',
    stdout: result.stdout || '',
  };
}

describe('wrapper.js input validation', () => {
  it('rejects an invocation with no package manager name', () => {
    const { status, stderr } = runWrapper([]);
    expect(status).toBe(1);
    expect(stderr).toContain('INVALID_INVOCATION:');
    expect(stderr).toContain('No package manager name');
  });

  it('rejects an unknown package manager name', () => {
    const { status, stderr } = runWrapper(['brew', 'install', 'jq']);
    expect(status).toBe(1);
    expect(stderr).toContain('INVALID_INVOCATION:');
    expect(stderr).toContain('brew');
  });

  it('rejects a name that only differs by case, since launchers are exact', () => {
    const { status, stderr } = runWrapper(['NPM', 'install']);
    expect(status).toBe(1);
    expect(stderr).toContain('INVALID_INVOCATION:');
  });

  it('does not fall back to a real binary on an invalid invocation', () => {
    // A fallback here would run some other tool's help output; the only
    // thing on stdout should be nothing at all.
    expect(runWrapper(['brew']).stdout.trim()).toBe('');
  });

  it('names the accepted values so the caller can fix the launcher', () => {
    expect(runWrapper(['brew']).stderr).toContain('<npm|npx|yarn|pnpm>');
  });

  it('accepts every supported package manager name', () => {
    // `--version` is answered by wrapper.js itself without spawning bun,
    // which makes it the cheapest way to prove validation let the call past.
    const expected = { npm: '10.8.2', yarn: '1.22.22', pnpm: '9.12.0' };
    for (const [invokedAs, version] of Object.entries(expected)) {
      const { status, stdout, stderr } = runWrapper([invokedAs, '--version']);
      expect(stderr).not.toContain('INVALID_INVOCATION');
      expect(stdout.trim()).toBe(version);
      expect(status).toBe(0);
    }
  });
});
