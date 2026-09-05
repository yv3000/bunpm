// core/errors.js
// Structured errors for bunpm. Every failure bunpm raises deliberately
// carries a stable string `code` alongside its human-readable message, so
// tooling that shells out to bunpm can branch on the code instead of
// pattern-matching English prose that may be reworded later.
// Only uses Node.js built-ins — no external dependencies.
//
// NOTE: bootstrap.js deliberately does NOT use this module. At the moment
// bootstrap.js runs, core/ has not been downloaded to disk yet, which is
// the same reason bootstrap.js duplicates detectPlatform() instead of
// importing it. Every code below therefore has a call site in core/.

/**
 * The complete set of bunpm error codes. Frozen so a typo like
 * CODES.BUN_MISSING reads as undefined at the call site instead of
 * silently creating a new code.
 */
const CODES = Object.freeze({
  /** Bun is not installed, and the original package manager is missing too. */
  BUN_NOT_FOUND: 'BUN_NOT_FOUND',
  /** Bun cannot run this command, and the original binary is missing too. */
  UNSUPPORTED_COMMAND: 'UNSUPPORTED_COMMAND',
  /** Running on an OS bunpm does not support (not Windows/macOS/Linux). */
  UNSUPPORTED_PLATFORM: 'UNSUPPORTED_PLATFORM',
  /** The child process could not be started at all (permissions, ENOENT). */
  SPAWN_ERROR: 'SPAWN_ERROR',
  /** wrapper.js was called with arguments it cannot act on safely. */
  INVALID_INVOCATION: 'INVALID_INVOCATION',
});

class BunpmError extends Error {
  /**
   * @param {string} code - one of the values in CODES
   * @param {string} message - human-readable, may span multiple lines
   */
  constructor(code, message) {
    super(message);
    this.name = 'BunpmError';
    this.code = code;
    // Keep the factory frame out of the stack so the trace points at the
    // real failure site rather than at this constructor.
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, BunpmError);
    }
  }

  /**
   * Bun is not installed and the original package manager binary cannot be
   * located either — the one genuinely unrecoverable case.
   *
   * @param {string} fallbackBinaryName - 'npm' | 'npx' | 'yarn' | 'pnpm'
   * @returns {BunpmError}
   */
  static bunNotFound(fallbackBinaryName) {
    return new BunpmError(
      CODES.BUN_NOT_FOUND,
      `Bun is required but was not found, and the original ${fallbackBinaryName} binary ` +
        `could not be located either. Install Bun from https://bun.sh, ` +
        `or reinstall ${fallbackBinaryName}.`
    );
  }

  /**
   * The requested command has no bun equivalent (e.g. `npm publish`) and the
   * original binary that could have handled it is not on PATH.
   *
   * @param {string} command - the full command line the user typed, e.g. 'publish --dry-run'
   * @param {string} fallbackBinaryName - 'npm' | 'npx' | 'yarn' | 'pnpm'
   * @returns {BunpmError}
   */
  static unsupportedCommand(command, fallbackBinaryName) {
    return new BunpmError(
      CODES.UNSUPPORTED_COMMAND,
      `This command ("${command}") is not supported by Bun, and the original ` +
        `${fallbackBinaryName} binary could not be located on this system. ` +
        `Install ${fallbackBinaryName} normally to use this specific command.`
    );
  }

  /**
   * @param {string} platform - the raw process.platform value, e.g. 'aix'
   * @returns {BunpmError}
   */
  static unsupportedPlatform(platform) {
    return new BunpmError(
      CODES.UNSUPPORTED_PLATFORM,
      `bunpm does not support this platform (${platform}). ` +
        `Supported platforms: Windows, macOS, Linux.`
    );
  }

  /**
   * The child process could not be started — distinct from "the child ran
   * and exited non-zero", which is forwarded as an exit code, not an error.
   *
   * @param {string} execPath - the binary bunpm tried to run
   * @param {string} reason - the underlying spawn error message
   * @returns {BunpmError}
   */
  static spawnError(execPath, reason) {
    return new BunpmError(
      CODES.SPAWN_ERROR,
      `Failed to run "${execPath}": ${reason}`
    );
  }

  /**
   * wrapper.js received arguments it cannot act on. This is not a user
   * mistake in normal use — the launcher scripts always pass a valid
   * package manager name — so it usually means a hand-written or
   * mis-generated launcher.
   *
   * @param {string} detail - what specifically was wrong
   * @returns {BunpmError}
   */
  static invalidInvocation(detail) {
    return new BunpmError(
      CODES.INVALID_INVOCATION,
      `${detail} Expected: node core/wrapper.js <npm|npx|yarn|pnpm> [args...]`
    );
  }
}

BunpmError.codes = CODES;

module.exports = { BunpmError, CODES };
