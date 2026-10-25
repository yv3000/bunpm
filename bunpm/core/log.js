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
 * @property {string} timestamp ISO 8601 UTC timestamp
 * @property {LogLevel} level diagnostic severity level
 * @property {string} module failing part: wrapper, exec, detector, doctor, ...
 * @property {string} message actionable text, cause preserved verbatim
 * @property {string|null} code error code such as ENOENT, when known
 */

/**
 * Create a structured diagnostic record matching the canonical 5-key schema.
 *
 * @param {string} component
 * @param {string} message
 * @param {string} [code]
 * @param {LogLevel} [level]
 * @returns {DiagnosticRecord}
 */
function formatDiagnostic(component, message, code, level = 'error') {
  return {
    timestamp: new Date().toISOString(),
    level,
    module: component,
    message,
    code: code || null,
  };
}

/** @type {((diagnostic: DiagnosticRecord) => void) | null} */
let errorHook = null;

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
  const diagnostic = formatDiagnostic(component, message, code, level);
  if (process.env.BUNPM_DEBUG === '1')
    console.error(JSON.stringify(diagnostic));
  if (level === 'error' && errorHook) {
    try {
      errorHook(diagnostic);
    } catch {
      // Error tracking hooks must never crash the CLI.
    }
  }
}

/**
 * Structured logger methods for multi-level diagnostics.
 * @error_tracking bunpm-diagnostic-error-tracking
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
  /**
   * Register an optional error-tracking callback for downstream monitoring.
   * @param {((diagnostic: DiagnosticRecord) => void) | null} callback
   */
  onError: (callback) => {
    errorHook = typeof callback === 'function' ? callback : null;
  },
  /**
   * Create a child structured logger bound to a module that always emits
   * canonical 5-key JSON diagnostic records to stderr regardless of BUNPM_DEBUG.
   * @param {string} [module]
   */
  child: (module) => {
    const mod = typeof module === 'string' && module ? module : 'wrapper';
    /** @param {LogLevel} level @param {string} message @param {string} [code] */
    const emit = (level, message, code) => {
      const diagnostic = formatDiagnostic(mod, message, code, level);
      console.error(JSON.stringify(diagnostic));
      if (level === 'error' && errorHook) {
        try {
          errorHook(diagnostic);
        } catch {
          // Error tracking hooks must never crash the CLI.
        }
      }
    };
    return Object.freeze({
      error: (message, code) => emit('error', message, code),
      warn: (message, code) => emit('warn', message, code),
      info: (message, code) => emit('info', message, code),
      debug: (message, code) => emit('debug', message, code),
      child: (submodule) => logger.child(`${mod}:${submodule}`),
    });
  },
});

const createLogger = (module) => logger.child(module);

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

module.exports = {
  LOG_LEVELS,
  log,
  logger,
  formatDiagnostic,
  metrics,
  createLogger,
};
