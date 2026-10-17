const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { classifyFreshness } = require('../scripts/check-freshness');

describe('dependency freshness reporting', () => {
  const version = { current: '1.0.0', wanted: '1.0.0', latest: '2.0.0' };

  test('accepts empty results and npm package rows, including repeated names', () => {
    assert.deepEqual(classifyFreshness('{}', 0), {
      status: 'no-updates-reported',
      exitCode: 0,
      packages: {},
    });
    for (const packages of [
      { tool: version },
      { tool: [version, { wanted: '1.0.0', latest: '2.0.0' }] },
      { error: version },
    ]) {
      const result = classifyFreshness(JSON.stringify(packages), 1);
      assert.equal(result.status, 'outdated');
      assert.deepEqual(result.packages, packages);
    }
  });

  test('never presents failed or malformed queries as successful freshness data', () => {
    for (const [text, code] of [
      ['', 1],
      ['not json', 0],
      ['null', 0],
      ['[]', 0],
      ['1', 0],
      ['{}', 1],
      ['{}', 2],
      ['{}', NaN],
      ['{}', 143],
      ['{"error":{"code":"ECONNREFUSED"}}', 0],
      ['{"error":{"code":"ECONNREFUSED","summary":"registry unavailable"}}', 1],
      ['{"tool":null}', 1],
      ['{"tool":[]}', 1],
      ['{"tool":{"latest":"2.0.0"}}', 1],
      ['{"tool":{"wanted":"1.0.0","latest":""}}', 1],
    ]) {
      const result = classifyFreshness(text, code);
      assert.equal(result.status, 'unavailable', text);
      assert.equal('packages' in result, false);
      assert.equal(typeof result.reason, 'string');
    }
  });

  test('CLI writes an advisory artifact and fails only when data is unavailable', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-freshness-'));
    try {
      const file = path.join(root, 'report.json');
      for (const [raw, code, status] of [
        ['{}', '0', 'no-updates-reported'],
        [JSON.stringify({ tool: version }), '1', 'outdated'],
        ['{"error":{"code":"ECONNREFUSED"}}', '1', 'unavailable'],
        ['', '1', 'unavailable'],
      ]) {
        fs.writeFileSync(file, raw);
        const result = cp.spawnSync(
          process.execPath,
          ['scripts/check-freshness.js', file, code],
          { encoding: 'utf8' },
        );
        assert.equal(
          result.status,
          status === 'unavailable' ? 1 : 0,
          result.stderr,
        );
        assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).status, status);
        assert.match(
          result.stdout,
          new RegExp(`Dependency freshness: ${status}`),
        );
        assert.equal(Boolean(result.stderr), status === 'unavailable');
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
