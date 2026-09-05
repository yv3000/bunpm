// core/platform-detect.test.js
// Unit tests for core/platform-detect.js — run with `bun test core/`.
// These call the real functions; nothing is stubbed except process.platform,
// which is the one input the module reads from the outside world.

const { describe, it, expect, afterEach } = require('bun:test');
const os = require('os');
const path = require('path');

const {
  detectPlatform,
  getHomeDir,
  getInstallRoot,
  getBinDir,
  getCoreDir,
  getScriptsDir,
  getShellProfileCandidates,
} = require('./platform-detect');

// process.platform is read-only in normal use, so we swap it via a property
// descriptor and restore the original descriptor after every test. Storing
// the descriptor (rather than just the string) matters because on some
// runtimes process.platform is a getter, not a plain value.
const ORIGINAL_PLATFORM_DESCRIPTOR = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(value) {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true,
    writable: false,
    enumerable: true,
  });
}

afterEach(() => {
  Object.defineProperty(process, 'platform', ORIGINAL_PLATFORM_DESCRIPTOR);
});

describe('detectPlatform()', () => {
  it('maps win32 to windows', () => {
    setPlatform('win32');
    expect(detectPlatform()).toBe('windows');
  });

  it('maps darwin to macos', () => {
    setPlatform('darwin');
    expect(detectPlatform()).toBe('macos');
  });

  it('maps linux to linux', () => {
    setPlatform('linux');
    expect(detectPlatform()).toBe('linux');
  });

  it('throws a helpful error on an unsupported platform', () => {
    setPlatform('aix');
    expect(() => detectPlatform()).toThrow(/does not support this platform \(aix\)/);
    // The message must tell the user what IS supported and where to report it,
    // otherwise the throw is no better than a crash.
    expect(() => detectPlatform()).toThrow(/Windows, macOS, Linux/);
    expect(() => detectPlatform()).toThrow(/github\.com\/yv3000\/bunpm\/issues/);
  });

  it('returns one of exactly three values on the real host platform', () => {
    expect(['windows', 'macos', 'linux']).toContain(detectPlatform());
  });
});

describe('install path helpers', () => {
  it('getHomeDir() matches os.homedir()', () => {
    expect(getHomeDir()).toBe(os.homedir());
  });

  it('getInstallRoot() is <home>/.bunpm', () => {
    const root = getInstallRoot();
    expect(root).toContain('.bunpm');
    expect(path.basename(root)).toBe('.bunpm');
    expect(root.startsWith(os.homedir())).toBe(true);
  });

  it('getBinDir() is <home>/.bunpm/bin', () => {
    const binDir = getBinDir();
    expect(binDir).toContain('.bunpm');
    expect(path.basename(binDir)).toBe('bin');
    expect(path.dirname(binDir)).toBe(getInstallRoot());
  });

  it('getCoreDir() and getScriptsDir() sit directly under the install root', () => {
    expect(path.basename(getCoreDir())).toBe('core');
    expect(path.dirname(getCoreDir())).toBe(getInstallRoot());
    expect(path.basename(getScriptsDir())).toBe('scripts');
    expect(path.dirname(getScriptsDir())).toBe(getInstallRoot());
  });

  it('returns absolute paths', () => {
    expect(path.isAbsolute(getInstallRoot())).toBe(true);
    expect(path.isAbsolute(getBinDir())).toBe(true);
  });
});

describe('getShellProfileCandidates()', () => {
  it('prefers .zprofile on macOS (zsh is the default shell since Catalina)', () => {
    const candidates = getShellProfileCandidates('macos');
    expect(path.basename(candidates[0])).toBe('.zprofile');
    expect(candidates.map(p => path.basename(p))).toEqual([
      '.zprofile',
      '.zshrc',
      '.bash_profile',
      '.profile',
    ]);
  });

  it('prefers .bashrc on Linux', () => {
    const candidates = getShellProfileCandidates('linux');
    expect(path.basename(candidates[0])).toBe('.bashrc');
    expect(candidates.map(p => path.basename(p))).toEqual(['.bashrc', '.zshrc', '.profile']);
  });

  it('returns absolute paths under the home directory', () => {
    for (const candidate of getShellProfileCandidates('linux')) {
      expect(path.isAbsolute(candidate)).toBe(true);
      expect(path.dirname(candidate)).toBe(os.homedir());
    }
  });

  it('throws on windows — PATH there is set via the registry, not a profile file', () => {
    expect(() => getShellProfileCandidates('windows')).toThrow(/non-Unix platform: windows/);
  });

  it('throws on an unknown platform string', () => {
    expect(() => getShellProfileCandidates('freebsd')).toThrow(/non-Unix platform/);
  });
});
