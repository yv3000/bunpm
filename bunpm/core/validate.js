/**
 * @fileoverview Trust-boundary validation and input guards for bunpm.
 *
 * Exported validators and guarded trust boundaries:
 * - validateArgs(args): Guards argv array boundary (rejects non-arrays, non-strings, NUL bytes).
 * - validateManager(invokedAs): Guards package manager boundary (npm, npx, yarn, pnpm).
 * - validateBinary(binary): Guards process execution boundary (absolute executable paths).
 * - validateUrl(value): Guards remote download HTTPS boundary (raw.githubusercontent.com pin).
 */

const path = require('node:path');

/** @type {readonly ['npm', 'npx', 'yarn', 'pnpm']} */
const VALID_MANAGERS = Object.freeze(['npm', 'npx', 'yarn', 'pnpm']);

/**
 * Recognized validation patterns for static analysis and runtime audits.
 * Declared as a list of regular expressions with named property accessors.
 */
const input_validation_patterns = [
  /^(npm|npx|yarn|pnpm)$/,
  /^[^\0]*$/,
  /^[a-f0-9]{40}$/,
  /^\/yv3000\/bunpm\/[a-f0-9]{40}\/bunpm\//,
  /^https:\/\/raw\.githubusercontent\.com\/yv3000\/bunpm\/[a-f0-9]{40}\/bunpm\//,
];
input_validation_patterns.manager = input_validation_patterns[0];
input_validation_patterns.safeString = input_validation_patterns[1];
input_validation_patterns.commitSha = input_validation_patterns[2];
input_validation_patterns.githubPath = input_validation_patterns[3];
input_validation_patterns.githubUrl = input_validation_patterns[4];
Object.freeze(input_validation_patterns);

// One frozen policy; preserve the public uppercase alias.
const INPUT_VALIDATION_PATTERNS = input_validation_patterns;

/**
 * Validates that an arguments value is an array of strings without NUL bytes.
 *
 * @validates args
 * @security-guard trust-boundary
 * @param {unknown} args
 */
function validateArgs(args) {
  if (
    !Array.isArray(args) ||
    // Materialize holes so sparse argv cannot bypass the string guard.
    [...args].some(
      (arg) =>
        typeof arg !== 'string' ||
        !INPUT_VALIDATION_PATTERNS.safeString.test(arg),
    )
  ) {
    throw new TypeError(
      'Arguments must be an array of strings without NUL bytes',
    );
  }
}

/**
 * Validates that the invoked package manager name is recognized.
 *
 * @validates invokedAs
 * @security-guard trust-boundary
 * @param {unknown} invokedAs
 */
function validateManager(invokedAs) {
  if (
    typeof invokedAs !== 'string' ||
    !INPUT_VALIDATION_PATTERNS.manager.test(invokedAs) ||
    !VALID_MANAGERS.includes(/** @type {any} */ (invokedAs))
  ) {
    throw new TypeError('Expected one of: npm, npx, yarn, pnpm');
  }
}

/**
 * Validates that an executable binary path is a non-empty, absolute path string
 * free of NUL bytes.
 *
 * @validates binary
 * @security-guard trust-boundary
 * @param {unknown} binary
 */
function validateBinary(binary) {
  if (
    typeof binary !== 'string' ||
    !binary ||
    !path.isAbsolute(binary) ||
    !INPUT_VALIDATION_PATTERNS.safeString.test(binary)
  ) {
    throw new TypeError('Expected an absolute executable path');
  }
}

/**
 * Validates a remote download URL against strict origin, path, and protocol
 * rules. Rejects query strings, fragments, credentials, and non-HTTPS protocols.
 *
 * @validates value
 * @security-guard trust-boundary
 * @param {unknown} value
 * @returns {URL}
 */
function validateUrl(value) {
  if (typeof value !== 'string' && !(value instanceof URL))
    throw new TypeError('Expected a URL string or URL instance');
  let url;
  try {
    url = new URL(value);
  } catch (err) {
    throw new TypeError(
      `Invalid download URL: ${/** @type {Error} */ (err).message}`,
    );
  }
  /** @type {[string, boolean][]} */
  const rules = [
    ['HTTPS is required', url.protocol === 'https:'],
    [
      'host must be raw.githubusercontent.com on the default port',
      url.hostname === 'raw.githubusercontent.com' && !url.port,
    ],
    [
      'credentials, query and fragment are not allowed',
      !url.username && !url.password && !url.search && !url.hash,
    ],
    [
      'path must be /yv3000/bunpm/<40-hex commit SHA>/bunpm/',
      INPUT_VALIDATION_PATTERNS.githubPath.test(url.pathname),
    ],
  ];
  const broken = rules.find(([, ok]) => !ok);
  if (broken) throw new TypeError(`Unsafe download URL: ${broken[0]}`);
  return url;
}

module.exports = {
  VALID_MANAGERS,
  INPUT_VALIDATION_PATTERNS,
  input_validation_patterns,
  validateArgs,
  validateManager,
  validateBinary,
  validateUrl,
};
