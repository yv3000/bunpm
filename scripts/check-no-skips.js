const { spawnSync } = require('node:child_process');

/**
 * Parse TAP summary counts from node --test TAP output.
 * @param {string} tapOutput
 * @returns {{ tests: number, pass: number, fail: number, skipped: number }}
 */
function parseTapSummary(tapOutput) {
  const matchTests = tapOutput.match(/^# tests\s+(\d+)/m);
  const matchPass = tapOutput.match(/^# pass\s+(\d+)/m);
  const matchFail = tapOutput.match(/^# fail\s+(\d+)/m);
  const matchSkipped = tapOutput.match(/^# skipped\s+(\d+)/m);

  return {
    tests: matchTests ? Number(matchTests[1]) : 0,
    pass: matchPass ? Number(matchPass[1]) : 0,
    fail: matchFail ? Number(matchFail[1]) : 0,
    skipped: matchSkipped ? Number(matchSkipped[1]) : 0,
  };
}

/**
 * Run tests with TAP reporter and assert zero skips.
 * @param {string[]} testFiles
 * @returns {number} 0 on success, 1 on skip or failure
 */
function checkNoSkips(testFiles = ['tests/smoke.test.js']) {
  const args = ['--test', '--test-reporter=tap', ...testFiles];
  const res = spawnSync(process.execPath, args, { encoding: 'utf8' });
  const summary = parseTapSummary(res.stdout || '');

  if (summary.skipped > 0) {
    console.error(
      `bunpm: check-no-skips: ${summary.skipped} test(s) skipped in ${testFiles.join(', ')}`,
    );
    return 1;
  }
  if (summary.fail > 0 || res.status !== 0) {
    console.error(
      `bunpm: check-no-skips: ${summary.fail} test(s) failed in ${testFiles.join(', ')}`,
    );
    return 1;
  }
  if (summary.pass === 0) {
    console.error(
      `bunpm: check-no-skips: 0 tests passed in ${testFiles.join(', ')}`,
    );
    return 1;
  }

  console.log(
    `ok   verified ${summary.pass} test(s) executed with 0 skips in ${testFiles.join(', ')}`,
  );
  return 0;
}

if (require.main === module) {
  const files = process.argv.slice(2);
  const code = checkNoSkips(files.length ? files : ['tests/smoke.test.js']);
  process.exitCode = code;
}

module.exports = { parseTapSummary, checkNoSkips };
