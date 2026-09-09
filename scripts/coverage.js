const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-coverage-'));
try {
  const result = spawnSync(
    'bun',
    [
      'test',
      '--coverage',
      '--coverage-reporter=lcov',
      `--coverage-dir=${root}`,
    ],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status || 1;
  else {
    const required = [
      'bunpm/bootstrap.js',
      ...fs
        .readdirSync('bunpm/core')
        .filter((file) => file.endsWith('.js'))
        .map((file) => `bunpm/core/${file}`),
    ];
    const records = fs
      .readFileSync(path.join(root, 'lcov.info'), 'utf8')
      .split('end_of_record');
    for (const file of required) {
      const record = records.find((entry) =>
        entry
          .split('\n')
          .some(
            (line) =>
              line.startsWith('SF:') &&
              line.replaceAll('\\', '/').endsWith(file),
          ),
      );
      if (!record) throw new Error(`Missing production coverage: ${file}`);
      for (const [found, hit, label] of [
        ['LF', 'LH', 'lines'],
        ['FNF', 'FNH', 'functions'],
      ]) {
        const total = Number(
          record.match(new RegExp(`^${found}:(\\d+)`, 'm'))?.[1],
        );
        const covered = Number(
          record.match(new RegExp(`^${hit}:(\\d+)`, 'm'))?.[1],
        );
        const ratio = covered / total;
        console.log(
          `${file}: ${(ratio * 100).toFixed(2)}% ${label} (${covered}/${total})`,
        );
        if (!Number.isFinite(ratio) || ratio < 0.9)
          throw new Error(`${file}: ${label} coverage below 90%`);
      }
    }
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
