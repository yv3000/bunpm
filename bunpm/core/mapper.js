// lib/mapper.js
// Translates npm/npx commands and flags to their bun equivalents.
// Only uses Node.js built-ins — no external dependencies.

// ─── Full npm command → bun command mapping ─────────────────────────────────
const NPM_TO_BUN = {
  // Package installation
  'install':     { cmd: 'add',      argsPassthrough: true  },  // npm install X → bun add X
  'i':           { cmd: 'add',      argsPassthrough: true  },  // npm i X → bun add X
  'add':         { cmd: 'add',      argsPassthrough: true  },  // npm add X → bun add X
  // Special case: npm install (no args) → bun install — handled in mapCommand()

  // Continuous integration install
  'ci':          { cmd: 'install',  args: ['--frozen-lockfile'], argsPassthrough: false },

  // Removal
  'uninstall':   { cmd: 'remove',   argsPassthrough: true  },
  'remove':      { cmd: 'remove',   argsPassthrough: true  },
  'rm':          { cmd: 'remove',   argsPassthrough: true  },
  'r':           { cmd: 'remove',   argsPassthrough: true  },
  'un':          { cmd: 'remove',   argsPassthrough: true  },
  'unlink':      { cmd: 'remove',   argsPassthrough: true  },

  // Running scripts
  'run':         { cmd: 'run',      argsPassthrough: true  },  // npm run dev → bun run dev
  'run-script':  { cmd: 'run',      argsPassthrough: true  },
  'start':       { cmd: 'run',      args: ['start']        },  // npm start → bun run start
  'test':        { cmd: 'test',     argsPassthrough: true  },  // npm test → bun test
  't':           { cmd: 'test',     argsPassthrough: true  },
  'stop':        { cmd: 'run',      args: ['stop']         },
  'restart':     { cmd: 'run',      args: ['restart']      },

  // Exec (npx equivalent)
  'exec':        { cmd: 'x',        argsPassthrough: true  },  // npm exec X → bun x X

  // Init / create
  'init':        { cmd: 'init',     argsPassthrough: true  },
  'create':      { cmd: 'create',   argsPassthrough: true  },

  // Update
  'update':      { cmd: 'update',   argsPassthrough: true  },
  'upgrade':     { cmd: 'update',   argsPassthrough: true  },
  'up':          { cmd: 'update',   argsPassthrough: true  },

  // Info / listing
  'list':        { cmd: 'pm',       args: ['ls']           },  // npm list → bun pm ls
  'ls':          { cmd: 'pm',       args: ['ls']           },
  'outdated':    { cmd: 'outdated', argsPassthrough: true  },

  // Version / info
  '--version':   { cmd: '--version', argsPassthrough: false },
  '-v':          { cmd: '--version', argsPassthrough: false },
  'version':     { cmd: '--version', argsPassthrough: false },

  // Cache
  'cache':       { cmd: 'pm',       args: ['cache']        },

  // Dedupe / prune (approximate)
  'dedupe':      { cmd: 'install',  args: ['--no-save']    },
  'prune':       { cmd: 'install',  args: []               },

  // Link
  'link':        { cmd: 'link',     argsPassthrough: true  },

  // Rebuild
  'rebuild':     { cmd: 'rebuild',  argsPassthrough: true  },
  'rb':          { cmd: 'rebuild',  argsPassthrough: true  },

  // ── Commands that bun doesn't support — fallback to original npm ──────────
  'publish':     { fallbackToNpm: true },
  'login':       { fallbackToNpm: true },
  'logout':      { fallbackToNpm: true },
  'whoami':      { fallbackToNpm: true },
  'adduser':     { fallbackToNpm: true },
  'audit':       { fallbackToNpm: true },
  'fund':        { fallbackToNpm: true },
  'pack':        { fallbackToNpm: true },
  'deprecate':   { fallbackToNpm: true },
  'dist-tag':    { fallbackToNpm: true },
  'access':      { fallbackToNpm: true },
  'team':        { fallbackToNpm: true },
  'profile':     { fallbackToNpm: true },
  'org':         { fallbackToNpm: true },
  'token':       { fallbackToNpm: true },
  'hook':        { fallbackToNpm: true },
};

// ─── Flag translation: npm flags → bun equivalents ─────────────────────────
const FLAG_MAP = {
  '--save-dev':          '-d',
  '-D':                  '-d',
  '--save-exact':        '-E',
  '-E':                  '-E',
  '--global':            '-g',
  '-g':                  '-g',
  '--save':              '',          // bun saves by default — drop this flag
  '-S':                  '',
  '--no-save':           '--no-save',
  '--legacy-peer-deps':  '',          // bun handles peers differently — drop
  '--force':             '--force',
  '-f':                  '--force',
  '--frozen-lockfile':   '--frozen-lockfile',
  '--production':        '--production',
  '--prefer-offline':    '--prefer-offline',
  '--registry':          '--registry',
  '--verbose':           '--verbose',
  '--silent':            '--silent',
  '--quiet':             '--silent',
  '-q':                  '--silent',
};

/**
 * Main mapper function.
 * Takes the invokedAs context ('npm' or 'npx') and the raw args array.
 * Returns an object describing what to execute.
 *
 * @param {string} invokedAs  — 'npm' or 'npx'
 * @param {string[]} args     — user-supplied arguments
 * @returns {{ useBunx?: boolean, bunArgs?: string[], fallbackToNpm: boolean, fallbackArgs?: string[] }}
 */
function mapCommand(invokedAs, args) {
  // ── npx → bunx (simple passthrough) ──────────────────────────────────────
  if (invokedAs === 'npx') {
    return {
      useBunx: true,
      bunArgs: args,
      fallbackToNpm: false,
    };
  }

  // ── npm with no subcommand → show help ────────────────────────────────────
  if (!args || args.length === 0) {
    return {
      useBunx: false,
      bunArgs: ['--help'],
      fallbackToNpm: false,
    };
  }

  const subcommand = args[0].toLowerCase();
  const restArgs = args.slice(1);

  // Look up mapping
  const mapping = NPM_TO_BUN[subcommand];

  // Unknown subcommand → fallback to original npm
  if (!mapping) {
    return { fallbackToNpm: true, fallbackArgs: args };
  }

  // Explicit fallback flag
  if (mapping.fallbackToNpm) {
    return { fallbackToNpm: true, fallbackArgs: args };
  }

  // ── Special case: `npm install` / `npm i` with NO package args ────────────
  // Should map to `bun install` (install all deps), not `bun add`
  if ((subcommand === 'install' || subcommand === 'i') && !hasPackageArgs(restArgs)) {
    return {
      useBunx: false,
      bunArgs: ['install', ...translateFlags(restArgs)],
      fallbackToNpm: false,
    };
  }

  // ── Build bun args from mapping ──────────────────────────────────────────
  let bunArgs = [mapping.cmd];

  if (mapping.args) {
    bunArgs = bunArgs.concat(mapping.args);
  }

  if (mapping.argsPassthrough) {
    bunArgs = bunArgs.concat(translateFlags(restArgs));
  }

  return {
    useBunx: false,
    bunArgs,
    fallbackToNpm: false,
  };
}

/**
 * Translate npm flags to bun equivalents.
 * Unknown flags pass through unchanged; mapped-to-empty flags are dropped.
 *
 * @param {string[]} args
 * @returns {string[]}
 */
function translateFlags(args) {
  return args.map(arg => {
    if (arg.startsWith('-')) {
      // Handle --flag=value style
      const eqIndex = arg.indexOf('=');
      const flag = eqIndex !== -1 ? arg.substring(0, eqIndex) : arg;
      const value = eqIndex !== -1 ? arg.substring(eqIndex + 1) : null;

      const translated = FLAG_MAP[flag];
      if (translated === undefined) return arg;  // unknown flag — pass through
      if (translated === '') return null;         // drop this flag entirely
      return value !== null ? `${translated}=${value}` : translated;
    }
    return arg;
  }).filter(Boolean); // remove nulls (dropped flags)
}

/**
 * Check if restArgs contains actual package names (not just flags).
 * @param {string[]} args
 * @returns {boolean}
 */
function hasPackageArgs(args) {
  return args.some(a => !a.startsWith('-'));
}

module.exports = { mapCommand, FLAG_MAP, NPM_TO_BUN };
