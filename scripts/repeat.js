const { spawnSync } = require('node:child_process');
// ponytail: --test-randomize arrived in Node 26.1; on older Node (CI pins 22)
// the three passes repeat in file order instead of a seeded random order.
const randomize = process.allowedNodeEnvironmentFlags.has('--test-randomize');
for (const seed of [20260909, 20260910, 20260911]) {
  const random = randomize
    ? ['--test-randomize', `--test-random-seed=${seed}`]
    : [];
  const result = spawnSync(
    process.execPath,
    ['--test', ...random, 'tests/*.test.js'],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    break;
  }
}
