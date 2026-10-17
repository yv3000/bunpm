const fs = require('node:fs');

/**
 * npm uses exit 1 for both outdated packages and registry failures.
 * Validate its result before describing a freshness query as successful.
 * @param {string} text
 * @param {number} exitCode
 * @returns {{ status: 'unavailable', exitCode: number, reason: string } |
 * { status: 'outdated' | 'no-updates-reported', exitCode: number, packages: object }}
 */
function classifyFreshness(text, exitCode) {
  /** @param {string} reason @returns {{ status: 'unavailable', exitCode: number, reason: string }} */
  const unavailable = (reason) => ({ status: 'unavailable', exitCode, reason });
  let packages;
  try {
    packages = JSON.parse(text);
  } catch {
    return unavailable('npm did not return valid JSON');
  }
  if (exitCode !== 0 && exitCode !== 1)
    return unavailable('npm did not complete its freshness query');
  if (!packages || typeof packages !== 'object' || Array.isArray(packages))
    return unavailable('npm did not return a package report');
  const entries = Object.values(packages);
  const valid = entries.every((entry) => {
    const rows = Array.isArray(entry) ? entry : [entry];
    return (
      rows.length > 0 &&
      rows.every(
        (row) =>
          row &&
          typeof row.wanted === 'string' &&
          row.wanted.length > 0 &&
          typeof row.latest === 'string' &&
          row.latest.length > 0,
      )
    );
  });
  if (!valid || (exitCode === 1 && entries.length === 0))
    return unavailable('npm returned an error or incomplete package data');
  // npm can omit inaccessible packages; an empty result is not an audit.
  return {
    status: entries.length ? 'outdated' : 'no-updates-reported',
    exitCode,
    packages,
  };
}

if (require.main === module) {
  const [file, exitCode] = process.argv.slice(2);
  const report = classifyFreshness(
    fs.readFileSync(file, 'utf8'),
    Number(exitCode),
  );
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  console.log(`Dependency freshness: ${report.status}`);
  if (report.status === 'unavailable') {
    console.error(report.reason);
    process.exitCode = 1;
  }
}

module.exports = { classifyFreshness };
