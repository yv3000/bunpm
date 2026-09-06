const { it, expect } = require('bun:test');
const { spawnSync } = require('child_process');
const path = require('path');

it('rejects overlong arguments at every wrapper entry point before execution', () => {
  for (const name of ['npm', 'npx', 'yarn', 'pnpm']) {
    const result = spawnSync(process.execPath, [
      path.join(__dirname, 'wrapper.js'), name, '--version', 'x'.repeat(5000),
    ], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('INVALID_INVOCATION:');
    expect(result.stderr).toContain('4096');
    expect(result.stdout).toBe('');
  }
});
