// lib/formatter.js
// Transforms bun's raw output to look like npm output.
// Intercepts stdout/stderr line by line, rewrites bun-specific lines,
// and passes everything else through unchanged.
// Only uses Node.js built-ins — no external dependencies.

/**
 * Transform a single line of bun output to look like npm output.
 * Returns null to suppress a line entirely.
 *
 * @param {string} line      — a single line of output
 * @param {object} context   — { subcommand: string, invokedAs: string }
 * @returns {string|null}    — transformed line, or null to suppress
 */
function formatLine(line, context) {
  // ── bun add / install / remove / update header lines ──────────────────────
  // "bun add v1.1.38" → suppress (npm doesn't print this)
  if (/^bun (add|install|remove|update) v\d/.test(line)) return null;

  // ── bun add output ────────────────────────────────────────────────────────
  // " installed express@4.18.2" → "added express@4.18.2"
  if (/^\s+installed /.test(line)) {
    return line.replace(/installed /, 'added ');
  }

  // "Done in 123ms" → suppress for add commands (npm doesn't print this)
  if (/^Done in \d+/.test(line) && context.subcommand === 'add') return null;

  // ── bun install output ────────────────────────────────────────────────────
  // " 35 packages installed [1.23s]" → "added 35 packages in 1.23s"
  const installMatch = line.match(/^\s+(\d+) packages? installed \[(.+)\]/);
  if (installMatch) {
    return `added ${installMatch[1]} packages in ${installMatch[2]}`;
  }

  // " 0 packages installed" → "up to date"
  if (/^\s+0 packages? installed/.test(line)) {
    return 'up to date, audited 0 packages in 0s';
  }

  // ── bun run output ────────────────────────────────────────────────────────
  // "$ command-name" → suppress (npm doesn't show the $ prefix)
  if (/^\$ /.test(line) && context.subcommand === 'run') return null;

  // ── bun --version ─────────────────────────────────────────────────────────
  // Return a realistic npm version string instead of bun's version
  if (context.subcommand === '--version' || context.subcommand === 'version') {
    return '10.8.2';
  }

  // ── Error lines ───────────────────────────────────────────────────────────
  // "error: ..." → "npm error ..."
  if (/^error:/.test(line)) {
    return line.replace(/^error:/, 'npm error');
  }

  // ── Remaining bun branding ────────────────────────────────────────────────
  // Any line starting with "bun " (except "bun run") → suppress
  if (/^bun /.test(line) && !/^bun run/.test(line)) return null;

  // ── Everything else: pass through unchanged ───────────────────────────────
  return line;
}

/**
 * Format a complete multi-line output string.
 *
 * @param {string} rawOutput — raw output from bun
 * @param {object} context   — { subcommand: string, invokedAs: string }
 * @returns {string}
 */
function formatOutput(rawOutput, context) {
  return rawOutput
    .split('\n')
    .map(line => formatLine(line, context))
    .filter(line => line !== null)
    .join('\n');
}

module.exports = { formatLine, formatOutput };
