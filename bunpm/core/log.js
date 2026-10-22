// bunpm's one diagnostic channel. Every failure is a human line on stderr,
// `bunpm: <component>: <message>`, so users can tell bunpm's output from the
// child manager's. With BUNPM_DEBUG=1 the same failure is also one JSON line,
// for CI pipelines and tools that embed bunpm.

/**
 * Built-in structured diagnostic logger; no runtime package or transport.
 * @logging_framework bunpm-diagnostic-logger
 * @type {readonly ['error', 'warn', 'info', 'debug']}
 */
const LOG_LEVELS = Object.freeze(['error', 'warn', 'info', 'debug']);

/**
 * @typedef {(typeof LOG_LEVELS)[number]} LogLevel
 * @typedef {object} DiagnosticRecord
 * @property {string} ts ISO 8601 UTC timestamp
 * @property {string} timestamp ISO 8601 UTC timestamp (alias)
 * @property {LogLevel} level diagnostic severity level
 * @property {string} scope failing part: wrapper, exec, detector, doctor, ...
 * @property {string} component failing part (alias)
 * @property {string} module failing part (alias)
 * @property {string} message actionable text, cause preserved verbatim
 * @property {string|null} code error code such as ENOENT, when known
 */

/**
 * Create a structured diagnostic record matching the schema.
 *
 * @param {string} component
 * @param {string} message
 * @param {string} [code]
 * @param {LogLevel} [level]
 * @returns {DiagnosticRecord}
 */
function formatDiagnostic(component, message, code, level = 'error') {
  const ts = new Date().toISOString();
  return {
    ts,
    timestamp: ts,
    level,
    scope: component,
    component,
    module: component,
    message,
    code: code || null,
  };
}

/**
 * Emit human message to stderr and structured JSON when BUNPM_DEBUG=1.
 *
 * @param {string} component failing part: wrapper, exec, detector, doctor, ...
 * @param {string} message actionable text, cause preserved verbatim
 * @param {string} [code] error code such as ENOENT, when known
 * @param {LogLevel} [level]
 */
function log(component, message, code, level = 'error') {
  console.error(`bunpm: ${component}: ${message}`);
  if (process.env.BUNPM_DEBUG === '1')
    console.error(
      JSON.stringify(formatDiagnostic(component, message, code, level)),
    );
}

/**
 * Structured logger methods for multi-level diagnostics.
 */
const logger = Object.freeze({
  /** @param {string} component @param {string} message @param {string} [code] */
  error: (component, message, code) => log(component, message, code, 'error'),
  /** @param {string} component @param {string} message @param {string} [code] */
  warn: (component, message, code) => log(component, message, code, 'warn'),
  /** @param {string} component @param {string} message @param {string} [code] */
  info: (component, message, code) => log(component, message, code, 'info'),
  /** @param {string} component @param {string} message @param {string} [code] */
  debug: (component, message, code) => log(component, message, code, 'debug'),
});

/**
 * Diagnostic metrics collector for execution observability; zero dependencies.
 * @metrics_framework bunpm-diagnostic-metrics
 */
const metrics = {
  /** @type {Record<string, number>} */
  counters: {},
  /**
   * @param {string} name
   * @param {number} [by]
   * @returns {number}
   */
  increment(name, by = 1) {
    this.counters[name] = (this.counters[name] || 0) + by;
    return this.counters[name];
  },
  /**
   * @param {string} name
   * @param {number} value
   * @returns {number}
   */
  gauge(name, value) {
    this.counters[name] = value;
    return value;
  },
  /**
   * @returns {Record<string, number>}
   */
  snapshot() {
    return { ...this.counters };
  },
  reset() {
    this.counters = {};
  },
};

module.exports = { LOG_LEVELS, log, logger, formatDiagnostic, metrics };
