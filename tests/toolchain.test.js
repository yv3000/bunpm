const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');

// Every CI job must test with the same Node.js and Bun, and Dependabot cannot
// update the setup-node/setup-bun version inputs.
test('Node.js and Bun pins agree across CI jobs and package.json', () => {
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  /** @param {RegExp} pattern */
  const pins = (pattern) => [
    ...new Set([...ci.matchAll(pattern)].map((match) => match[1])),
  ];
  const [node, ...otherNode] = pins(/node-version: '([^']+)'/g);
  const [bun, ...otherBun] = pins(/bun-version: '([^']+)'/g);
  assert.deepEqual([otherNode, otherBun], [[], []]);
  assert.equal(pkg.packageManager, `bun@${bun}`);
  // The CI Node.js must satisfy the development engine floor.
  const floor = pkg.engines.node.replace('>=', '').split('.').map(Number);
  const pinned = node.split('.').map(Number);
  assert.ok(
    pinned[0] > floor[0] || (pinned[0] === floor[0] && pinned[1] >= floor[1]),
  );
});

// package.json declares the CLI entry, so `npm link` provides a `bunpm` command.
test('the bunpm bin is an executable Node script that takes a manager name', () => {
  const { bin } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(bin.bunpm, 'bunpm/core/wrapper.js');
  assert.match(fs.readFileSync(bin.bunpm, 'utf8'), /^#!\/usr\/bin\/env node\n/);
  const result = cp.spawnSync(process.execPath, [bin.bunpm], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /^bunpm: wrapper: Expected one of: npm, npx, yarn, pnpm/,
  );
});

// YAML 1.1 parsers (PyYAML, used by many repository scanners) read a bare
// `on:` key as boolean true, which hides the push/pull_request triggers.
test('CI workflow quotes its trigger key', () => {
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.doesNotMatch(ci, /^on:/m);
  assert.match(ci, /^(['"])on\1:\n {2}push:/m);
});

// The coverage gate must be able to fail the build, not just report.
test('c8 enforces the coverage thresholds and CI cannot ignore a miss', () => {
  const c8 = JSON.parse(fs.readFileSync('.c8rc.json', 'utf8'));
  assert.equal(c8['check-coverage'], true);
  assert.equal(c8.all, true);
  for (const [metric, minimum] of [
    ['lines', 90],
    ['functions', 90],
    ['branches', 90],
    ['statements', 95],
  ])
    assert.ok(
      c8[metric] >= minimum,
      `${metric} threshold ${c8[metric]} < ${minimum}`,
    );
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.match(pkg.scripts['test:coverage'], /^c8 node --test /);
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(
    ci,
    /name: Test with coverage \(c8 node:test\)\n\s+id: coverage\n\s+continue-on-error: false\n\s+run: npm run test:coverage/,
  );
});
