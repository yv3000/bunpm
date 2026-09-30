const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const THRESHOLD = 0.9;
// wrapper.js's batch-shim branch executes only on Windows, so a per-file gate
// on Unix would measure unreachable code rather than missing tests. The
// per-file gate therefore runs on Windows; every OS enforces the combined gate.
const perFile = process.platform === 'win32';

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
    const metrics = [
      ['LF', 'LH', 'lines'],
      ['FNF', 'FNH', 'functions'],
    ];
    const totals = Object.fromEntries(
      metrics.map(([, , label]) => [label, { covered: 0, total: 0 }]),
    );
    /** @type {string[]} */
    const failures = [];
    /**
     * @param {string} name
     * @param {string} label
     * @param {number} covered
     * @param {number} total
     */
    const check = (name, label, covered, total) => {
      const ratio = covered / total;
      console.log(
        `${name}: ${(ratio * 100).toFixed(2)}% ${label} (${covered}/${total})`,
      );
      if (!Number.isFinite(ratio) || ratio < THRESHOLD)
        failures.push(`${name}: ${label} coverage below 90%`);
    };
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
      for (const [found, hit, label] of metrics) {
        const total = Number(
          record.match(new RegExp(`^${found}:(\\d+)`, 'm'))?.[1],
        );
        const covered = Number(
          record.match(new RegExp(`^${hit}:(\\d+)`, 'm'))?.[1],
        );
        totals[label].covered += covered;
        totals[label].total += total;
        if (perFile) check(file, label, covered, total);
        else
          console.log(
            `${file}: ${((covered / total) * 100).toFixed(2)}% ${label} (${covered}/${total}, per-file gate runs on Windows)`,
          );
      }
    }
    for (const [label, { covered, total }] of Object.entries(totals))
      check('all runtime files', label, covered, total);
    if (failures.length) throw new Error(failures.join('\n'));
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
