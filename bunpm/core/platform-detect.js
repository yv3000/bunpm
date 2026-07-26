// core/platform-detect.js
// Single source of truth for OS detection across bunpm.
// Only uses Node.js built-ins — no external dependencies.

const os = require('os');
const path = require('path');

/**
 * Detect the current platform as one of: 'windows', 'macos', 'linux'.
 * Throws a clear error for genuinely unsupported platforms (e.g. AIX, SunOS)
 * rather than silently guessing — bunpm v2 explicitly supports exactly these three.
 *
 * @returns {'windows'|'macos'|'linux'}
 */
function detectPlatform() {
  const platform = process.platform;
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  throw new Error(
    `bunpm does not support this platform (${platform}). ` +
    `Supported platforms: Windows, macOS, Linux. ` +
    `If you believe this platform should be supported, please open an issue at ` +
    `https://github.com/yv3000/bunpm/issues`
  );
}

/**
 * Get the home directory in a platform-correct way.
 * On Windows this is %USERPROFILE%, on macOS/Linux this is $HOME.
 * os.homedir() already handles this correctly across platforms, but we
 * wrap it here so every caller goes through one function and we can add
 * platform-specific overrides later if ever needed (e.g. WSL detection).
 *
 * @returns {string} absolute path to the user's home directory
 */
function getHomeDir() {
  return os.homedir();
}

/**
 * Get the bunpm installation root directory for the current platform.
 * Windows uses a dot-prefixed hidden folder under %USERPROFILE%.
 * macOS and Linux also use a dot-prefixed hidden folder under $HOME,
 * following Unix convention for user-level tool installs (similar to
 * how ~/.nvm, ~/.cargo, ~/.bun all live directly under $HOME).
 *
 * @returns {string} absolute path, e.g. "C:\Users\yash\.bunpm" or "/home/yash/.bunpm"
 */
function getInstallRoot() {
  return path.join(getHomeDir(), '.bunpm');
}

/**
 * Get the bin directory inside the install root, where launcher
 * scripts/executables live. This is the directory that gets prepended
 * to PATH.
 *
 * @returns {string} absolute path, e.g. "C:\Users\yash\.bunpm\bin"
 */
function getBinDir() {
  return path.join(getInstallRoot(), 'bin');
}

/**
 * Get the core directory inside the install root, where the shared
 * OS-agnostic JS files (detector.js, mapper.js, formatter.js, wrapper.js)
 * live after install.
 *
 * @returns {string} absolute path, e.g. "/home/yash/.bunpm/core"
 */
function getCoreDir() {
  return path.join(getInstallRoot(), 'core');
}

/**
 * Get the scripts directory inside the install root, where the
 * install/uninstall scripts for the CURRENT platform live after install.
 * Note this is NOT platform-namespaced inside the install root — once
 * installed, a user's machine only ever has ITS OWN platform's scripts,
 * copied flat into .bunpm/scripts/. The platforms/ subfolder structure
 * only exists in the GitHub repo for selective download purposes; it
 * does not need to be mirrored on the end user's disk.
 *
 * @returns {string} absolute path
 */
function getScriptsDir() {
  return path.join(getInstallRoot(), 'scripts');
}

/**
 * Get the appropriate shell profile file(s) to modify for PATH changes,
 * in priority order, for macOS and Linux. Returns an array because we
 * may need to check/write multiple candidate files (e.g. a user might
 * have both .bashrc and .zshrc, or only one).
 *
 * macOS since Catalina (10.15) defaults new shells to zsh, so .zprofile
 * is checked first. Linux distros vary more, so we check .bashrc first
 * since bash remains the most common default login shell on Linux,
 * then .zshrc and .profile as fallbacks.
 *
 * This function should NEVER be called on Windows — callers must check
 * detectPlatform() !== 'windows' first, or this function should throw.
 *
 * @param {'macos'|'linux'} platform
 * @returns {string[]} array of absolute paths to candidate profile files, in priority order
 */
function getShellProfileCandidates(platform) {
  const home = getHomeDir();
  if (platform === 'macos') {
    return [
      path.join(home, '.zprofile'),
      path.join(home, '.zshrc'),
      path.join(home, '.bash_profile'),
      path.join(home, '.profile'),
    ];
  }
  if (platform === 'linux') {
    return [
      path.join(home, '.bashrc'),
      path.join(home, '.zshrc'),
      path.join(home, '.profile'),
    ];
  }
  throw new Error(`getShellProfileCandidates() called with non-Unix platform: ${platform}`);
}

module.exports = {
  detectPlatform,
  getHomeDir,
  getInstallRoot,
  getBinDir,
  getCoreDir,
  getScriptsDir,
  getShellProfileCandidates,
};
