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
// bootstrap.js is read as text rather than required, because requiring it
// would immediately start downloading files and running the installer.

const { describe, it, expect } = require('bun:test');
const fs = require('fs');
const path = require('path');

const CORE_DIR = __dirname;
const BOOTSTRAP_PATH = path.join(CORE_DIR, '..', 'bootstrap.js');
const REPO_PACKAGE_DIR = path.join(CORE_DIR, '..');

/** @returns {string[]} the repo-relative paths listed in bootstrap.js CORE_FILES */
function readCoreFilesList() {
  const source = fs.readFileSync(BOOTSTRAP_PATH, 'utf8');
  const block = source.match(/const CORE_FILES = \[([\s\S]*?)\];/);
  if (!block) throw new Error('CORE_FILES array not found in bootstrap.js');
  return [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

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
  const coreFiles = readCoreFilesList();

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
