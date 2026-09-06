// core/download-manifest.test.js
// Guards the hand-maintained CORE_FILES list in bootstrap.js against drift.
//
// bootstrap.js downloads an explicit list of core/ files onto a user's
// machine. Adding a new module under core/ and requiring it from an existing
// one — without also adding it to that list — produces an install that only
// fails at first use, with MODULE_NOT_FOUND, on the user's machine. That is
// exactly what happened when core/errors.js was introduced. This test
// derives the require graph from the source and compares it to the list, so
// the whole class of mistake fails here instead of in the field.
//
// bootstrap.js exports CORE_FILES when it is required rather than executed.
// main() is guarded behind `require.main === module`, so requiring it here
// downloads nothing and installs nothing — bootstrap-local.test.js asserts
// that guard still holds. Reading the exported array beats scraping the
// source with a regex, which would quietly pass if the array were reformatted.

const { describe, it, expect } = require('bun:test');
const fs = require('fs');
const path = require('path');

const { CORE_FILES } = require('../bootstrap.js');

const CORE_DIR = __dirname;
const REPO_PACKAGE_DIR = path.join(CORE_DIR, '..');

/** @returns {string[]} names of the shipped (non-test) modules in core/ */
function shippedCoreModules() {
  return fs
    .readdirSync(CORE_DIR)
    .filter(name => name.endsWith('.js') && !name.endsWith('.test.js'));
}

/**
 * @param {string} fileName - e.g. 'wrapper.js'
 * @returns {string[]} repo-relative paths this file requires from core/
 */
function relativeRequires(fileName) {
  const source = fs.readFileSync(path.join(CORE_DIR, fileName), 'utf8');
  return [...source.matchAll(/require\('\.\/([\w-]+)(?:\.js)?'\)/g)].map(m => `core/${m[1]}.js`);
}

describe('bootstrap.js CORE_FILES', () => {
  const coreFiles = CORE_FILES;

  it('is not empty and is entirely core/ paths', () => {
    expect(coreFiles.length).toBeGreaterThan(0);
    for (const entry of coreFiles) {
      expect(entry.startsWith('core/')).toBe(true);
    }
  });

  it('lists only files that actually exist in the repo', () => {
    for (const entry of coreFiles) {
      expect(fs.existsSync(path.join(REPO_PACKAGE_DIR, entry))).toBe(true);
    }
  });

  it('lists every shipped module in core/, so nothing is silently omitted', () => {
    const expected = shippedCoreModules().map(name => `core/${name}`);
    expect(coreFiles.slice().sort()).toEqual(expected.sort());
  });

  it('covers every relative require made by a listed module', () => {
    for (const entry of coreFiles) {
      for (const dependency of relativeRequires(path.basename(entry))) {
        expect(coreFiles).toContain(dependency);
      }
    }
  });

  it('ships no test files to end users', () => {
    for (const entry of coreFiles) {
      expect(entry).not.toContain('.test.js');
    }
  });

  it('includes wrapper.js, the entry point the launchers call', () => {
    expect(coreFiles).toContain('core/wrapper.js');
  });
});

describe('published package manifest', () => {
  const manifestPath = path.join(REPO_PACKAGE_DIR, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  it('declares no dependencies of any kind', () => {
    // bootstrap.js copies this manifest onto the user's machine and never runs
    // an install against it, so anything declared here would simply be absent
    // at runtime — the failure would surface as MODULE_NOT_FOUND on the user's
    // first npm command, not as a failed install. eslint and prettier live in
    // the repo-root manifest for exactly this reason.
    //
    // A lockfile next to this manifest cannot enforce the same thing: bun
    // deletes empty lockfiles ("No packages! Deleted empty lockfile"), so a
    // zero-dependency package has nothing to lock. This test is the guard.
    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      expect(manifest[field]).toBeUndefined();
    }
  });

  it('points main at a file bootstrap actually downloads', () => {
    expect(CORE_FILES).toContain(manifest.main);
  });

  it('declares the same version as the repo-root manifest', () => {
    // A release bumps both. Bumping one and forgetting the other produces a
    // tag whose commit disagrees with itself about what version it is.
    const rootManifest = JSON.parse(
      fs.readFileSync(path.join(REPO_PACKAGE_DIR, '..', 'package.json'), 'utf8')
    );
    expect(manifest.version).toBe(rootManifest.version);
  });
});
