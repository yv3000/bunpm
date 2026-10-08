const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');

// CI, the Docker image and the dev container must test with the same Node.js
// and Bun, and Dependabot cannot update the setup-node/setup-bun version inputs.
test('Node.js and Bun pins agree across CI, Docker, dev container and package.json', () => {
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const devcontainer = JSON.parse(
    fs.readFileSync('.devcontainer/devcontainer.json', 'utf8'),
  );
  /** @param {RegExp} pattern */
  const pins = (pattern) => [
    ...new Set([...ci.matchAll(pattern)].map((match) => match[1])),
  ];
  const node = dockerfile.match(/^FROM node:(\d+\.\d+\.\d+)-/m)?.[1];
  const bun = dockerfile.match(/^FROM oven\/bun:(\d+\.\d+\.\d+)/m)?.[1];
  assert.deepEqual(pins(/node-version: '([^']+)'/g), [node]);
  assert.deepEqual(pins(/bun-version: '([^']+)'/g), [bun]);
  assert.equal(pkg.packageManager, `bun@${bun}`);
  assert.equal(devcontainer.build.dockerfile, '../Dockerfile');
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
