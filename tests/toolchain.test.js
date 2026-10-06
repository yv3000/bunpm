const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

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
