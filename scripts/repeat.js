const { spawnSync } = require('node:child_process');
for (const seed of [20260909, 20260910, 20260911]) {
  const result = spawnSync('bun', ['test', '--randomize', `--seed=${seed}`], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    break;
  }
}
