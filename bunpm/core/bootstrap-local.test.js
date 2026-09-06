// bootstrap-local.test.js — unit tests for the side-effect-free parts of
// bootstrap.js: the staging path mapping and the BUNPM_REPO_BASE override.
//
// bootstrap.js guards main() behind `require.main === module`, so requiring it
// here hands back only the helpers. That guard is load-bearing for this file:
// without it, requiring bootstrap.js would download 17 files and execute a
// platform install script on whatever machine ran the test suite. The
// "does not run main() when required" test below is what catches its removal.

const { describe, it, expect } = require('bun:test');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  toLocalStagingPath,
  REPO_BASE,
  DEFAULT_REPO_BASE,
  PLATFORM_FILES,
} = require('../bootstrap.js');

const BOOTSTRAP_PATH = path.join(__dirname, '..', 'bootstrap.js');
const PLATFORMS = ['windows', 'macos', 'linux'];

// bootstrap.js throws for anything else at require time, so by the time this
// file is running, process.platform is guaranteed to be one of these three.
const HOST_PLATFORM = {
  win32: 'windows',
  darwin: 'macos',
  linux: 'linux',
}[process.platform];

describe('toLocalStagingPath', () => {
  it('strips the platform prefix so the user never sees platforms/ on disk', () => {
    expect(toLocalStagingPath('platforms/windows/bin/npm.cmd', 'windows')).toBe('bin/npm.cmd');
    expect(toLocalStagingPath('platforms/macos/scripts/install.sh', 'macos')).toBe('scripts/install.sh');
    expect(toLocalStagingPath('platforms/linux/bin/pnpm', 'linux')).toBe('bin/pnpm');
    expect(toLocalStagingPath('platforms/linux/scripts/uninstall.sh', 'linux')).toBe('scripts/uninstall.sh');
  });

  it('leaves core/ paths untouched', () => {
    expect(toLocalStagingPath('core/wrapper.js', 'windows')).toBe('core/wrapper.js');
    expect(toLocalStagingPath('core/errors.js', 'linux')).toBe('core/errors.js');
  });

  it('leaves root-level files untouched', () => {
    expect(toLocalStagingPath('package.json', 'linux')).toBe('package.json');
    expect(toLocalStagingPath('package.json', 'windows')).toBe('package.json');
  });

  it('strips ONLY the requested platform, not the other two', () => {
    // Not an accident. bootstrap downloads one platform's subtree, so only
    // that prefix ever needs removing; a path from another platform showing
    // up here would mean the download loop picked the wrong PLATFORM_FILES
    // key, and leaving it visibly unstripped is the louder failure.
    expect(toLocalStagingPath('platforms/macos/bin/npm', 'windows'))
      .toBe('platforms/macos/bin/npm');
    expect(toLocalStagingPath('platforms/windows/bin/npm.cmd', 'linux'))
      .toBe('platforms/windows/bin/npm.cmd');
  });

  it('defaults to the detected platform when none is passed', () => {
    expect(toLocalStagingPath(`platforms/${HOST_PLATFORM}/bin/npm`)).toBe('bin/npm');
    expect(toLocalStagingPath('core/mapper.js')).toBe('core/mapper.js');
  });

  it('maps every declared platform file into a flat bin/ or scripts/ folder', () => {
    for (const platform of PLATFORMS) {
      for (const repoPath of PLATFORM_FILES[platform]) {
        const staged = toLocalStagingPath(repoPath, platform);
        expect(staged).not.toContain('platforms/');
        expect(staged.startsWith('bin/') || staged.startsWith('scripts/')).toBe(true);
      }
    }
  });
});

describe('BUNPM_REPO_BASE override', () => {
  it('defaults to the canonical GitHub raw URL over https', () => {
    // https is not cosmetic here: this URL is the origin of code that gets
    // executed by the installer at the end of main().
    expect(DEFAULT_REPO_BASE.startsWith('https://')).toBe(true);
    expect(DEFAULT_REPO_BASE).toContain('raw.githubusercontent.com/yv3000/bunpm');
  });

  it('uses the default when the env var is not set', () => {
    expect(process.env.BUNPM_REPO_BASE).toBeUndefined();
    expect(REPO_BASE).toBe(DEFAULT_REPO_BASE);
  });

  it('reads the override from the environment at load time', () => {
    const override = 'http://localhost:9999/some-fork';
    const result = spawnSync(
      process.execPath,
      ['-e', `console.log(require(${JSON.stringify(BOOTSTRAP_PATH)}).REPO_BASE);`],
      { encoding: 'utf8', env: { ...process.env, BUNPM_REPO_BASE: override } }
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(override);
  });

  it('falls back to the default in a subprocess with no override set', () => {
    const env = { ...process.env };
    delete env.BUNPM_REPO_BASE;
    const result = spawnSync(
      process.execPath,
      ['-e', `console.log(require(${JSON.stringify(BOOTSTRAP_PATH)}).REPO_BASE);`],
      { encoding: 'utf8', env }
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(DEFAULT_REPO_BASE);
  });

  it('picks the http client for an http:// override, not just https', () => {
    // A local static server is the whole point of the override, and an
    // https-only download() would reject one. Asserted against source
    // because exercising it for real needs a live server and a full install.
    const source = fs.readFileSync(BOOTSTRAP_PATH, 'utf8');
    expect(source).toContain("require('http')");
    expect(source).toContain("startsWith('http://') ? http : https");
  });
});

describe('module boundary', () => {
  it('does not run main() when required, so requiring it installs nothing', () => {
    // main() logs its banner before doing anything else, so empty stdout is
    // proof it never started. If the require.main guard is ever dropped, this
    // fails instead of silently installing bunpm on a contributor's machine.
    const result = spawnSync(
      process.execPath,
      ['-e', `require(${JSON.stringify(BOOTSTRAP_PATH)});`],
      { encoding: 'utf8' }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('exports the helpers the tests need and nothing that mutates state', () => {
    const exported = require('../bootstrap.js');
    expect(typeof exported.toLocalStagingPath).toBe('function');
    expect(Array.isArray(exported.CORE_FILES)).toBe(true);
    expect(Object.keys(exported.PLATFORM_FILES).sort()).toEqual([...PLATFORMS].sort());
    expect(exported.main).toBeUndefined();
    expect(exported.download).toBeUndefined();
  });
});
