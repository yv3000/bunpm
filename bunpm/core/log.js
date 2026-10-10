// bunpm's one diagnostic channel. Every failure is a human line on stderr,
// `bunpm: <component>: <message>`, so users can tell bunpm's output from the
// child manager's. With BUNPM_DEBUG=1 the same failure is also one JSON line,
// for CI pipelines and tools that embed bunpm.

/**
 * @param {string} component failing part: wrapper, exec, detector, doctor, ...
 * @param {string} message actionable text, cause preserved verbatim
 * @param {string} [code] error code such as ENOENT, when known
 */
function log(component, message, code) {
  console.error(`bunpm: ${component}: ${message}`);
  if (process.env.BUNPM_DEBUG === '1')
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        component,
        message,
        ...(code && { code }),
      }),
    );
}

module.exports = { log };
