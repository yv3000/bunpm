// core/mapper.js
// Translates npm, yarn, and pnpm commands + flags to their bun equivalents.
// Only uses Node.js built-ins — no external dependencies.
// This file is OS-agnostic — the exact same logic runs on Windows, macOS, and Linux.

// ─────────────────────────────────────────────────────────────────────────
// NPM TABLE — unchanged from v1.2.2, preserved exactly
// ─────────────────────────────────────────────────────────────────────────
const NPM_TO_BUN = {
  'install':     { cmd: 'add',      argsPassthrough: true  },
  'i':           { cmd: 'add',      argsPassthrough: true  },
  'add':         { cmd: 'add',      argsPassthrough: true  },
  'ci':          { cmd: 'install',  args: ['--frozen-lockfile'], argsPassthrough: false },
  'uninstall':   { cmd: 'remove',   argsPassthrough: true  },
  'remove':      { cmd: 'remove',   argsPassthrough: true  },
  'rm':          { cmd: 'remove',   argsPassthrough: true  },
  'r':           { cmd: 'remove',   argsPassthrough: true  },
  'un':          { cmd: 'remove',   argsPassthrough: true  },
  'unlink':      { cmd: 'remove',   argsPassthrough: true  },
  'run':         { cmd: 'run',      argsPassthrough: true  },
  'run-script':  { cmd: 'run',      argsPassthrough: true  },
  'start':       { cmd: 'run',      args: ['start']        },
  'test':        { cmd: 'test',     argsPassthrough: true  },
  't':           { cmd: 'test',     argsPassthrough: true  },
  'stop':        { cmd: 'run',      args: ['stop']         },
  'restart':     { cmd: 'run',      args: ['restart']      },
  'exec':        { cmd: 'x',        argsPassthrough: true  },
  'init':        { cmd: 'init',     argsPassthrough: true  },
  'create':      { cmd: 'create',   argsPassthrough: true  },
  'update':      { cmd: 'update',   argsPassthrough: true  },
  'upgrade':     { cmd: 'update',   argsPassthrough: true  },
  'up':          { cmd: 'update',   argsPassthrough: true  },
  'list':        { cmd: 'pm',       args: ['ls']           },
  'ls':          { cmd: 'pm',       args: ['ls']           },
  'outdated':    { cmd: 'outdated', argsPassthrough: true  },
  '--version':   { cmd: '--version', argsPassthrough: false },
  '-v':          { cmd: '--version', argsPassthrough: false },
  'version':     { cmd: '--version', argsPassthrough: false },
  'cache':       { cmd: 'pm',       args: ['cache']        },
  'dedupe':      { cmd: 'install',  args: ['--no-save']    },
  'prune':       { cmd: 'install',  args: []               },
  'link':        { cmd: 'link',     argsPassthrough: true  },
  'rebuild':     { cmd: 'rebuild',  argsPassthrough: true  },
  'rb':          { cmd: 'rebuild',  argsPassthrough: true  },
  'publish':     { fallbackTo: 'npm' },
  'login':       { fallbackTo: 'npm' },
  'logout':      { fallbackTo: 'npm' },
  'whoami':      { fallbackTo: 'npm' },
  'adduser':     { fallbackTo: 'npm' },
  'audit':       { fallbackTo: 'npm' },
  'fund':        { fallbackTo: 'npm' },
  'pack':        { fallbackTo: 'npm' },
  'deprecate':   { fallbackTo: 'npm' },
  'dist-tag':    { fallbackTo: 'npm' },
  'access':      { fallbackTo: 'npm' },
  'team':        { fallbackTo: 'npm' },
  'profile':     { fallbackTo: 'npm' },
  'org':         { fallbackTo: 'npm' },
  'token':       { fallbackTo: 'npm' },
  'hook':        { fallbackTo: 'npm' },
};

const NPM_FLAG_MAP = {
  '--save-dev':          '-d',
  '-D':                  '-d',
  '--save-exact':        '-E',
  '-E':                  '-E',
  '--global':            '-g',
  '-g':                  '-g',
  '--save':              '',
  '-S':                  '',
  '--no-save':           '--no-save',
  '--legacy-peer-deps':  '',
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

// ─────────────────────────────────────────────────────────────────────────
// YARN TABLE — NEW IN V2
// Covers both Yarn Classic (1.x) and Yarn Berry (2.x/3.x/4.x) common subset.
// Subcommands not listed here, or explicitly marked fallbackTo: 'yarn',
// fall back to the real yarn binary if one exists on the system, or print
// a clear "yarn not found and bun does not support this" error if not.
// ─────────────────────────────────────────────────────────────────────────
const YARN_TO_BUN = {
  // No-subcommand `yarn` with zero args means "install everything" in yarn,
  // exactly like bare `npm install`. Handled as a special case in
  // mapYarnCommand() below, not in this table, because it needs the
  // "no package args present" check just like npm install does.

  'add':         { cmd: 'add',      argsPassthrough: true  },   // yarn add express -> bun add express
  'remove':      { cmd: 'remove',   argsPassthrough: true  },   // yarn remove express -> bun remove express
  'install':     { cmd: 'install',  argsPassthrough: true  },   // yarn install -> bun install (explicit form)
  'run':         { cmd: 'run',      argsPassthrough: true  },   // yarn run dev -> bun run dev
  'global':      { cmd: 'add',      args: ['-g'], argsPassthrough: true, sliceFirstArg: true }, // yarn global add X -> bun add -g X (sliceFirstArg drops the literal word "add" that follows "global")
  'upgrade':     { cmd: 'update',   argsPassthrough: true  },   // yarn upgrade -> bun update
  'up':          { cmd: 'update',   argsPassthrough: true  },   // yarn up (Berry alias) -> bun update
  'why':         { cmd: 'pm',       args: ['why'], argsPassthrough: true }, // yarn why express -> bun pm why express
  'list':        { cmd: 'pm',       args: ['ls']           },
  'outdated':    { cmd: 'outdated', argsPassthrough: true  },
  'init':        { cmd: 'init',     argsPassthrough: true  },
  'create':      { cmd: 'create',   argsPassthrough: true  },   // yarn create vite -> bun create vite
  'dlx':         { useBunx: true, sliceFirstArg: true },          // yarn dlx create-vite -> bunx create-vite (special dispatch handled in wrapper, sliceFirstArg drops literal "dlx")
  'exec':        { useBunx: true, sliceFirstArg: true },          // yarn exec X -> bunx X (Berry's exec, same pattern as dlx)
  'link':        { cmd: 'link',     argsPassthrough: true  },
  'unlink':      { cmd: 'unlink',   argsPassthrough: true  },
  'version':     { cmd: '--version', argsPassthrough: false },
  '--version':   { cmd: '--version', argsPassthrough: false },
  '-v':          { cmd: '--version', argsPassthrough: false },
  'cache':       { cmd: 'pm',       args: ['cache']        },
  'audit':       { fallbackTo: 'yarn' },
  'login':       { fallbackTo: 'yarn' },
  'logout':      { fallbackTo: 'yarn' },
  'publish':     { fallbackTo: 'yarn' },
  'pack':        { fallbackTo: 'yarn' },
  'config':      { fallbackTo: 'yarn' },         // yarn config get/set has no clean bun equivalent
  'workspaces':  { fallbackTo: 'yarn' },         // Berry-specific workspace tooling, too version-specific to safely proxy
  'workspace':   { fallbackTo: 'yarn' },
  'set':         { fallbackTo: 'yarn' },         // Berry's `yarn set version` etc — version-management commands stay native
  'plugin':      { fallbackTo: 'yarn' },         // Berry plugin system has no bun equivalent at all
  'constraints': { fallbackTo: 'yarn' },         // Berry-only feature, no equivalent
};

const YARN_FLAG_MAP = {
  '--dev':               '-d',
  '-D':                  '-d',
  '--exact':             '-E',
  '-E':                  '-E',
  '--ignore-engines':    '',          // bun does not enforce engines field the same way, drop
  '--frozen-lockfile':   '--frozen-lockfile',
  '--prefer-offline':    '--prefer-offline',
  '--silent':            '--silent',
  '--verbose':           '--verbose',
  '-W':                  '',          // yarn's "skip workspace root check" flag, no bun equivalent needed since bun doesn't enforce this the same way
  '--ignore-scripts':    '--ignore-scripts',
};

// ─────────────────────────────────────────────────────────────────────────
// PNPM TABLE — NEW IN V2
// pnpm's command vocabulary is closest to npm's of the three, but pnpm's
// strict-by-default node_modules structure (no phantom dependencies) is
// NOT replicated by bun — bun's node_modules layout is flatter, closer to
// npm's. This is the single most important behavioral difference users
// of this table need to be aware of, documented in the README.
// ─────────────────────────────────────────────────────────────────────────
const PNPM_TO_BUN = {
  'add':         { cmd: 'add',      argsPassthrough: true  },
  'install':     { cmd: 'install',  argsPassthrough: true  },
  'i':           { cmd: 'install',  argsPassthrough: true  },
  'remove':      { cmd: 'remove',   argsPassthrough: true  },
  'rm':          { cmd: 'remove',   argsPassthrough: true  },
  'uninstall':   { cmd: 'remove',   argsPassthrough: true  },
  'un':          { cmd: 'remove',   argsPassthrough: true  },
  'run':         { cmd: 'run',      argsPassthrough: true  },
  'start':       { cmd: 'run',      args: ['start']        },
  'test':        { cmd: 'test',     argsPassthrough: true  },
  't':           { cmd: 'test',     argsPassthrough: true  },
  'update':      { cmd: 'update',   argsPassthrough: true  },
  'up':          { cmd: 'update',   argsPassthrough: true  },
  'upgrade':     { cmd: 'update',   argsPassthrough: true  },
  'list':        { cmd: 'pm',       args: ['ls']           },
  'ls':          { cmd: 'pm',       args: ['ls']           },
  'outdated':    { cmd: 'outdated', argsPassthrough: true  },
  'why':         { cmd: 'pm',       args: ['why'], argsPassthrough: true },
  'init':        { cmd: 'init',     argsPassthrough: true  },
  'create':      { cmd: 'create',   argsPassthrough: true  },
  'dlx':         { useBunx: true, sliceFirstArg: true },     // pnpm dlx create-vite -> bunx create-vite
  'exec':        { cmd: 'run',      argsPassthrough: true  }, // pnpm exec X -> closest is bun run X for scripts; for arbitrary binaries this is imperfect, documented limitation
  'link':        { cmd: 'link',     argsPassthrough: true  },
  'unlink':      { cmd: 'unlink',   argsPassthrough: true  },
  '--version':   { cmd: '--version', argsPassthrough: false },
  '-v':          { cmd: '--version', argsPassthrough: false },
  'version':     { cmd: '--version', argsPassthrough: false },
  'store':       { fallbackTo: 'pnpm' },         // pnpm's content-addressable store management, no bun equivalent
  'audit':       { fallbackTo: 'pnpm' },
  'login':       { fallbackTo: 'pnpm' },
  'logout':      { fallbackTo: 'pnpm' },
  'publish':     { fallbackTo: 'pnpm' },
  'pack':        { fallbackTo: 'pnpm' },
  'config':      { fallbackTo: 'pnpm' },
  'patch':       { fallbackTo: 'pnpm' },         // pnpm's patch-package-like feature, no bun equivalent
  'patch-commit': { fallbackTo: 'pnpm' },
  'rebuild':     { cmd: 'rebuild',  argsPassthrough: true  },
  'rb':          { cmd: 'rebuild',  argsPassthrough: true  },
  'deploy':      { fallbackTo: 'pnpm' },         // pnpm workspace deploy feature, version-specific, stays native
  'recursive':   { fallbackTo: 'pnpm' },         // pnpm -r / pnpm recursive, workspace-wide ops, too complex to safely proxy
};

const PNPM_FLAG_MAP = {
  '--save-dev':          '-d',
  '-D':                  '-d',
  '--save-exact':        '-E',
  '-E':                  '-E',
  '--global':            '-g',
  '-g':                  '-g',
  '--frozen-lockfile':   '--frozen-lockfile',
  '--prefer-offline':    '--prefer-offline',
  '--silent':            '--silent',
  '--reporter':          '',          // pnpm-specific output formatting flag, no bun equivalent, drop
  '--filter':             '',          // pnpm workspace filter syntax differs from bun's --filter syntax enough that blind passthrough would be wrong; dropped here means workspace-filtered commands fall through to fallbackTo:'pnpm' at the subcommand level instead (handled by checking for this flag's presence, see mapPnpmCommand below)
};

// ─────────────────────────────────────────────────────────────────────────
// SHARED FLAG TRANSLATION HELPER — used by all three mapXCommand functions
// ─────────────────────────────────────────────────────────────────────────

/**
 * Translate package-manager-specific flags to bun equivalents using the
 * given flag map. Unknown flags pass through unchanged (bun will either
 * understand them or ignore them); flags mapped to empty string are
 * dropped entirely (the flag has no bun equivalent and forwarding it
 * would cause bun to error out on an unrecognized flag).
 *
 * @param {string[]} args
 * @param {Object<string,string>} flagMap
 * @returns {string[]}
 */
function translateFlags(args, flagMap) {
  return args.map(arg => {
    if (arg.startsWith('-')) {
      const eqIndex = arg.indexOf('=');
      const flag = eqIndex !== -1 ? arg.substring(0, eqIndex) : arg;
      const value = eqIndex !== -1 ? arg.substring(eqIndex + 1) : null;
      const translated = flagMap[flag];
      if (translated === undefined) return arg;
      if (translated === '') return null;
      return value !== null ? `${translated}=${value}` : translated;
    }
    return arg;
  }).filter(Boolean);
}

/**
 * Check if args contains anything that isn't a flag — used to distinguish
 * "npm install" (no args, install everything from package.json) from
 * "npm install express" (args present, add a specific package).
 *
 * @param {string[]} args
 * @returns {boolean}
 */
function hasNonFlagArgs(args) {
  return args.some(a => !a.startsWith('-'));
}

// ─────────────────────────────────────────────────────────────────────────
// NPM MAPPING FUNCTION — preserved from v1.2.2 logic exactly
// ─────────────────────────────────────────────────────────────────────────

/**
 * @param {string[]} args - user-supplied arguments after "npm"
 * @returns {{useBunx?: boolean, bunArgs?: string[], fallbackTo?: string, fallbackArgs?: string[]}}
 */
function mapNpmCommand(args) {
  if (!args || args.length === 0) {
    return { useBunx: false, bunArgs: ['--help'], fallbackTo: null };
  }
  const subcommand = args[0].toLowerCase();
  const restArgs = args.slice(1);
  const mapping = NPM_TO_BUN[subcommand];

  if (!mapping) {
    return { fallbackTo: 'npm', fallbackArgs: args };
  }
  if (mapping.fallbackTo) {
    return { fallbackTo: mapping.fallbackTo, fallbackArgs: args };
  }

  // Special case: npm install / npm i with no package args = install all deps
  if ((subcommand === 'install' || subcommand === 'i') && !hasNonFlagArgs(restArgs)) {
    return { useBunx: false, bunArgs: ['install', ...translateFlags(restArgs, NPM_FLAG_MAP)], fallbackTo: null };
  }

  let bunArgs = [mapping.cmd];
  if (mapping.args) bunArgs = bunArgs.concat(mapping.args);
  if (mapping.argsPassthrough) bunArgs = bunArgs.concat(translateFlags(restArgs, NPM_FLAG_MAP));

  return { useBunx: false, bunArgs, fallbackTo: null };
}

// ─────────────────────────────────────────────────────────────────────────
// YARN MAPPING FUNCTION — NEW IN V2
// ─────────────────────────────────────────────────────────────────────────

/**
 * @param {string[]} args - user-supplied arguments after "yarn"
 * @returns {{useBunx?: boolean, bunArgs?: string[], fallbackTo?: string, fallbackArgs?: string[]}}
 */
function mapYarnCommand(args) {
  // Bare `yarn` with no args at all = install everything, same as `bun install`
  if (!args || args.length === 0) {
    return { useBunx: false, bunArgs: ['install'], fallbackTo: null };
  }

  const subcommand = args[0].toLowerCase();
  const restArgs = args.slice(1);

  // Special case: `yarn` followed immediately by a package name with no
  // recognized subcommand word is yarn's shorthand for `yarn add <pkg>`.
  // Example: `yarn express` is equivalent to `yarn add express` in real yarn.
  // We detect this by checking: is args[0] NOT a known subcommand AND NOT
  // a flag? If so, treat the entire args array as implicit "add" args.
  const isKnownSubcommand = Object.prototype.hasOwnProperty.call(YARN_TO_BUN, subcommand);
  const looksLikeFlag = subcommand.startsWith('-');
  if (!isKnownSubcommand && !looksLikeFlag) {
    return { useBunx: false, bunArgs: ['add', ...translateFlags(args, YARN_FLAG_MAP)], fallbackTo: null };
  }

  const mapping = YARN_TO_BUN[subcommand];
  if (!mapping) {
    return { fallbackTo: 'yarn', fallbackArgs: args };
  }
  if (mapping.fallbackTo) {
    return { fallbackTo: mapping.fallbackTo, fallbackArgs: args };
  }
  if (mapping.useBunx) {
    // yarn dlx <pkg> / yarn exec <pkg> -> bunx <pkg>
    // sliceFirstArg means we drop the literal subcommand word itself
    // (it's already been consumed into `subcommand` above) and pass
    // everything after it to bunx.
    return { useBunx: true, bunArgs: restArgs, fallbackTo: null };
  }

  // yarn install with no package args = install everything
  if (subcommand === 'install' && !hasNonFlagArgs(restArgs)) {
    return { useBunx: false, bunArgs: ['install', ...translateFlags(restArgs, YARN_FLAG_MAP)], fallbackTo: null };
  }

  // yarn global add <pkg> needs the literal word "add" sliced out of
  // restArgs before passthrough, since YARN_TO_BUN['global'] already
  // sets cmd:'add' args:['-g'] — we don't want to pass "add" through
  // again as if it were a package name.
  let effectiveRestArgs = restArgs;
  if (mapping.sliceFirstArg && restArgs[0] && restArgs[0].toLowerCase() === 'add') {
    effectiveRestArgs = restArgs.slice(1);
  }

  let bunArgs = [mapping.cmd];
  if (mapping.args) bunArgs = bunArgs.concat(mapping.args);
  if (mapping.argsPassthrough) bunArgs = bunArgs.concat(translateFlags(effectiveRestArgs, YARN_FLAG_MAP));

  return { useBunx: false, bunArgs, fallbackTo: null };
}

// ─────────────────────────────────────────────────────────────────────────
// PNPM MAPPING FUNCTION — NEW IN V2
// ─────────────────────────────────────────────────────────────────────────

/**
 * @param {string[]} args - user-supplied arguments after "pnpm"
 * @returns {{useBunx?: boolean, bunArgs?: string[], fallbackTo?: string, fallbackArgs?: string[]}}
 */
function mapPnpmCommand(args) {
  if (!args || args.length === 0) {
    return { useBunx: false, bunArgs: ['install'], fallbackTo: null };
  }

  const subcommand = args[0].toLowerCase();
  const restArgs = args.slice(1);

  // pnpm uses -r / --recursive / --filter for workspace-scoped operations
  // across multiple packages. Bun's own --filter syntax for workspaces is
  // similar but not guaranteed identical across all pnpm versions, so as
  // a safety-first default, ANY presence of -r, --recursive, or --filter
  // anywhere in the args causes an immediate fallback to real pnpm rather
  // than attempting a translation that might silently target the wrong
  // set of workspace packages.
  const hasWorkspaceFlag = args.some(a =>
    a === '-r' || a === '--recursive' || a.startsWith('--filter')
  );
  if (hasWorkspaceFlag) {
    return { fallbackTo: 'pnpm', fallbackArgs: args };
  }

  const mapping = PNPM_TO_BUN[subcommand];
  if (!mapping) {
    return { fallbackTo: 'pnpm', fallbackArgs: args };
  }
  if (mapping.fallbackTo) {
    return { fallbackTo: mapping.fallbackTo, fallbackArgs: args };
  }
  if (mapping.useBunx) {
    return { useBunx: true, bunArgs: restArgs, fallbackTo: null };
  }

  if ((subcommand === 'install' || subcommand === 'i') && !hasNonFlagArgs(restArgs)) {
    return { useBunx: false, bunArgs: ['install', ...translateFlags(restArgs, PNPM_FLAG_MAP)], fallbackTo: null };
  }

  let bunArgs = [mapping.cmd];
  if (mapping.args) bunArgs = bunArgs.concat(mapping.args);
  if (mapping.argsPassthrough) bunArgs = bunArgs.concat(translateFlags(restArgs, PNPM_FLAG_MAP));

  return { useBunx: false, bunArgs, fallbackTo: null };
}

// ─────────────────────────────────────────────────────────────────────────
// TOP-LEVEL DISPATCH — what core/wrapper.js actually calls
// ─────────────────────────────────────────────────────────────────────────

/**
 * Main entry point. Dispatches to the correct package-manager-specific
 * mapper based on which binary the user invoked.
 *
 * @param {string} invokedAs - one of 'npm', 'npx', 'yarn', 'pnpm'
 * @param {string[]} args
 * @returns {{useBunx?: boolean, bunArgs?: string[], fallbackTo?: string, fallbackArgs?: string[]}}
 */
function mapCommand(invokedAs, args) {
  if (invokedAs === 'npx') {
    // npx is always a direct passthrough to bunx, no subcommand table needed
    return { useBunx: true, bunArgs: args, fallbackTo: null };
  }
  if (invokedAs === 'npm') {
    return mapNpmCommand(args);
  }
  if (invokedAs === 'yarn') {
    return mapYarnCommand(args);
  }
  if (invokedAs === 'pnpm') {
    return mapPnpmCommand(args);
  }
  throw new Error(`mapCommand() called with unknown invokedAs value: "${invokedAs}". Expected one of: npm, npx, yarn, pnpm.`);
}

module.exports = {
  mapCommand,
  mapNpmCommand,
  mapYarnCommand,
  mapPnpmCommand,
  NPM_TO_BUN,
  NPM_FLAG_MAP,
  YARN_TO_BUN,
  YARN_FLAG_MAP,
  PNPM_TO_BUN,
  PNPM_FLAG_MAP,
  translateFlags,
  hasNonFlagArgs,
};
