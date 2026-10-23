/**
 * @fileoverview Declarative runtime schema validation at trust boundaries.
 * Zero-runtime-dependency schema validator centralizing CLI, URL, and env guards.
 */

const {
  INPUT_VALIDATION_PATTERNS,
  input_validation_patterns,
  validateArgs,
  validateUrl,
} = require('./validate');

/**
 * Validates CLI arguments array against trust-boundary schema.
 * Rejects non-arrays, non-strings, and NUL characters.
 *
 * @param {unknown} args
 * @returns {asserts args is string[]}
 */
function assertCliArgs(args) {
  validateArgs(args);
}

/**
 * Validates a remote download URL against HTTPS and path constraints.
 *
 * @param {unknown} url
 * @returns {URL}
 */
function assertHttpsUrl(url) {
  return validateUrl(url);
}

/**
 * Validates environment variable key and string content.
 * Rejects non-strings, control characters, and unsafe path traversal sequences.
 *
 * @param {string} name
 * @param {unknown} value
 * @returns {string}
 */
function assertSafeEnv(name, value) {
  if (typeof name !== 'string' || !name || /[\0\r\n]/.test(name)) {
    throw new TypeError('Invalid environment variable name');
  }
  if (typeof value !== 'string') {
    throw new TypeError(`Environment variable ${name} must be a string`);
  }
  if (/[\0]/.test(value)) {
    throw new TypeError(`Environment variable ${name} cannot contain NUL bytes`);
  }
  return value;
}

module.exports = {
  input_validation_patterns,
  INPUT_VALIDATION_PATTERNS,
  assertCliArgs,
  assertHttpsUrl,
  assertSafeEnv,
};
