// core/formatter.js
// Transforms bun's raw output to look like npm/yarn/pnpm output depending
// on which binary the user invoked. Intercepts stdout/stderr line by line.
// Only uses Node.js built-ins — no external dependencies.

/**
 * Parse a bun "installed X@Y" or "N packages installed [Ts]" line into
 * structured data, returning null if the line doesn't match either shape.
 * This is the shared parsing step all three formatters build on.
 *
 * @param {string} line
 * @returns {{type: 'single', name: string, version: string}|{type: 'count', count: number, time: string}|null}
 */
function parseBunInstallLine(line) {
  const singleMatch = line.match(/^\s+installed (\S+)@(\S+)/);
  if (singleMatch) {
    return { type: 'single', name: singleMatch[1], version: singleMatch[2] };
  }
  const countMatch = line.match(/^\s+(\d+) packages? installed \[(.+)\]/);
  if (countMatch) {
    return { type: 'count', count: parseInt(countMatch[1], 10), time: countMatch[2] };
  }
  return null;
}

/**
 * Format a single line of bun output to look like npm's output.
 * This is the v1.2.2 logic, preserved exactly, used when context.invokedAs === 'npm'.
 *
 * @param {string} line
 * @param {object} context
 * @returns {string|null}
 */
function formatAsNpm(line, context) {
  if (/^bun (add|install|remove|update) v\d/.test(line)) return null;
  if (/^\s+installed /.test(line)) return line.replace(/installed /, 'added ');
  if (/^Done in \d+/.test(line) && context.subcommand === 'add') return null;

  const installMatch = line.match(/^\s+(\d+) packages? installed \[(.+)\]/);
  if (installMatch) return `added ${installMatch[1]} packages in ${installMatch[2]}`;

  if (/^\s+0 packages? installed/.test(line)) return 'up to date, audited 0 packages in 0s';
  if (/^\$ /.test(line) && context.subcommand === 'run') return null;
  if (context.subcommand === '--version' || context.subcommand === 'version') return '10.8.2';
  if (/^error:/.test(line)) return line.replace(/^error:/, 'npm error');
  if (/^bun /.test(line) && !/^bun run/.test(line)) return null;

  return line;
}

/**
 * Format a single line of bun output to look like yarn classic's output.
 * NEW IN V2. Yarn's distinctive markers are the "success"/"info" prefixes
 * and the tree-style dependency listing with └─ characters. We don't
 * attempt to reproduce yarn's [1/4] progress steps since those describe
 * yarn's OWN internal resolve/fetch/link/build phases which don't map
 * to bun's actual internal steps — faking phase-by-phase progress that
 * doesn't correspond to real work happening would be actively misleading.
 * Instead we go straight from the "yarn add vX.X.X" header line to the
 * final success summary, which is honest about what's actually happening
 * (bun did the work, just faster, without yarn's phase breakdown).
 *
 * @param {string} line
 * @param {object} context
 * @returns {string|null}
 */
function formatAsYarn(line, context) {
  if (/^bun (add|install|remove|update) v\d/.test(line)) return null;

  const parsed = parseBunInstallLine(line);
  if (parsed) {
    if (parsed.type === 'single') {
      return `success Saved 1 new dependency.\ninfo Direct dependencies\n└─ ${parsed.name}@${parsed.version}`;
    }
    if (parsed.type === 'count') {
      return `success Saved ${parsed.count} new ${parsed.count === 1 ? 'dependency' : 'dependencies'}.`;
    }
  }

  if (/^Done in \d+/.test(line)) {
    const timeMatch = line.match(/Done in (\d+(?:\.\d+)?\w+)/);
    return timeMatch ? `Done in ${timeMatch[1]}.` : line;
  }
  if (/^\s+0 packages? installed/.test(line)) return 'success Already up-to-date.';
  if (/^\$ /.test(line) && context.subcommand === 'run') return null;
  if (context.subcommand === '--version' || context.subcommand === 'version') return '1.22.22';
  if (/^error:/.test(line)) return line.replace(/^error:/, 'error');
  if (/^bun /.test(line) && !/^bun run/.test(line)) return null;

  return line;
}

/**
 * Format a single line of bun output to look like pnpm's output.
 * NEW IN V2. pnpm's distinctive markers are the "Packages: +N" summary
 * line and the "dependencies:" section with "+" prefixed package lines.
 *
 * @param {string} line
 * @param {object} context
 * @returns {string|null}
 */
function formatAsPnpm(line, context) {
  if (/^bun (add|install|remove|update) v\d/.test(line)) return null;

  const parsed = parseBunInstallLine(line);
  if (parsed) {
    if (parsed.type === 'single') {
      return `Packages: +1\n+\n\ndependencies:\n+ ${parsed.name} ${parsed.version}`;
    }
    if (parsed.type === 'count') {
      return `Packages: +${parsed.count}\n${'+'.repeat(Math.min(parsed.count, 1))}`;
    }
  }

  if (/^Done in \d+/.test(line)) {
    const timeMatch = line.match(/Done in (.+)/);
    return timeMatch ? `Done in ${timeMatch[1]}` : line;
  }
  if (/^\s+0 packages? installed/.test(line)) return 'Already up to date';
  if (/^\$ /.test(line) && context.subcommand === 'run') return null;
  if (context.subcommand === '--version' || context.subcommand === 'version') return '9.12.0';
  if (/^error:/.test(line)) return line.replace(/^error:/, 'ERR_PNPM');
  if (/^bun /.test(line) && !/^bun run/.test(line)) return null;

  return line;
}

/**
 * Top-level dispatch — picks the right formatter based on context.invokedAs.
 * This is what core/wrapper.js actually calls.
 *
 * @param {string} line
 * @param {object} context - { subcommand: string, invokedAs: 'npm'|'yarn'|'pnpm' }
 * @returns {string|null}
 */
function formatLine(line, context) {
  if (context.invokedAs === 'yarn') return formatAsYarn(line, context);
  if (context.invokedAs === 'pnpm') return formatAsPnpm(line, context);
  return formatAsNpm(line, context); // default / npm
}

function formatOutput(rawOutput, context) {
  return rawOutput
    .split('\n')
    .map(line => formatLine(line, context))
    .filter(line => line !== null)
    .join('\n');
}

module.exports = { formatLine, formatOutput, formatAsNpm, formatAsYarn, formatAsPnpm, parseBunInstallLine };
