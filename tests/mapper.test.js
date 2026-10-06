const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapCommand } = require('../bunpm/core/mapper');

test('boolean flags with an explicit value fall back instead of being reinterpreted', () => {
  for (const [tool, args] of [
    ['npm', ['install', '--save=false', 'pkg']],
    ['npm', ['i', '--save-dev=false', 'pkg']],
    ['npm', ['i', '-g=false', 'pkg']],
    ['npm', ['install', '--production=false']],
    ['yarn', ['add', '--dev=false', 'pkg']],
    ['pnpm', ['add', '-D=false', 'pkg']],
  ])
    assert.deepEqual(mapCommand(tool, args), {
      fallbackTo: tool,
      fallbackArgs: args,
    });
  assert.deepEqual(
    mapCommand('npm', ['i', '--registry=https://r.test', 'pkg']).bunArgs,
    ['add', '--registry=https://r.test', 'pkg'],
  );
});
