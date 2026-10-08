// Only translate the common subset; unknown commands/options stay native.

/**
 * @typedef {'npm'|'npx'|'yarn'|'pnpm'} Manager
 * @typedef {{ fallbackTo: Manager, fallbackArgs: string[] }} Fallback
 * @typedef {{ useBunx: boolean, bunArgs: string[], fallbackTo: null }} Translated
 * @typedef {Fallback | Translated} Mapping
 */

/** @type {Record<string, string>} */
const NPM_FLAG_MAP = {
  '--save-dev': '-d',
  '-D': '-d',
  '--save-exact': '-E',
  '-E': '-E',
  '--global': '-g',
  '-g': '-g',
  '--save': '',
  '-S': '',
  '--no-save': '--no-save',
  '--force': '--force',
  '-f': '--force',
  '--production': '--production',
  '--registry': '--registry',
  '--verbose': '--verbose',
  '--silent': '--silent',
  '--quiet': '--silent',
  '-q': '--silent',
  '--ignore-scripts': '--ignore-scripts',
  '--frozen-lockfile': '--frozen-lockfile',
};
/** @type {Record<string, string>} */
const YARN_FLAG_MAP = {
  '--dev': '-d',
  '-D': '-d',
  '--exact': '-E',
  '-E': '-E',
  '--frozen-lockfile': '--frozen-lockfile',
  '--silent': '--silent',
  '--verbose': '--verbose',
  '--ignore-scripts': '--ignore-scripts',
};
/** @type {Record<string, string>} */
const PNPM_FLAG_MAP = { ...NPM_FLAG_MAP };
/** @type {Record<string, string>} */
const NPM_TO_BUN = {
  install: 'add',
  i: 'add',
  add: 'add',
  uninstall: 'remove',
  remove: 'remove',
  rm: 'remove',
  r: 'remove',
  un: 'remove',
  run: 'run',
  'run-script': 'run',
  start: 'run start',
  stop: 'run stop',
  restart: 'run restart',
  test: 'run test',
  t: 'run test',
  update: 'update',
  upgrade: 'update',
  up: 'update',
  list: 'pm ls',
  ls: 'pm ls',
  outdated: 'outdated',
  link: 'link',
  create: 'create',
};
/** @type {Record<string, string>} */
const YARN_TO_BUN = {
  add: 'add',
  remove: 'remove',
  install: 'install',
  run: 'run',
  test: 'run test',
  start: 'run start',
  upgrade: 'update',
  up: 'update',
  why: 'pm why',
  list: 'pm ls',
  outdated: 'outdated',
  create: 'create',
  link: 'link',
  unlink: 'unlink',
  dlx: 'x',
};
/** @type {Record<string, string>} */
const PNPM_TO_BUN = {
  ...NPM_TO_BUN,
  install: 'install',
  i: 'install',
  why: 'pm why',
  dlx: 'x',
};

/** @param {unknown} args */
function validateArgs(args) {
  if (
    !Array.isArray(args) ||
    args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))
  ) {
    throw new TypeError(
      'Arguments must be an array of strings without NUL bytes',
    );
  }
}

/**
 * @param {string[]} args
 * @param {Record<string, string>} flagMap
 * @returns {string[]}
 */
function translateFlags(args, flagMap) {
  /** @type {string[]} */
  const translated = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') return translated.concat(args.slice(i));
    const [flag] = arg.split('=');
    if (!Object.hasOwn(flagMap, flag)) {
      translated.push(arg);
      continue;
    }
    if (flagMap[flag] !== '')
      translated.push(flagMap[flag] + arg.slice(flag.length));
  }
  return translated;
}

/** @param {string[]} args */
function hasNonFlagArgs(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--') return i + 1 < args.length;
    if (args[i] === '--registry') {
      i++;
      continue;
    }
    if (args[i] !== '--' && !args[i].startsWith('-')) return true;
  }
  return false;
}

/**
 * @param {string} invokedAs
 * @param {string[]} args
 * @returns {Mapping}
 */
function mapCommand(invokedAs, args) {
  if (!['npm', 'npx', 'yarn', 'pnpm'].includes(invokedAs)) {
    throw new TypeError('Expected one of: npm, npx, yarn, pnpm');
  }
  validateArgs(args);
  /** @type {Fallback} */
  const fallback = {
    fallbackTo: /** @type {Manager} */ (invokedAs),
    fallbackArgs: args,
  };
  if (invokedAs === 'npx') {
    // npx options differ from bun x options; only the package-first form is safe.
    return args.length && !args[0].startsWith('-')
      ? { useBunx: true, bunArgs: args, fallbackTo: null }
      : fallback;
  }
  if (!args.length)
    return invokedAs === 'npm'
      ? fallback
      : { useBunx: false, bunArgs: ['install'], fallbackTo: null };
  /** @type {Record<string, Record<string, string>>} */
  const tables = { npm: NPM_TO_BUN, yarn: YARN_TO_BUN, pnpm: PNPM_TO_BUN };
  /** @type {Record<string, Record<string, string>>} */
  const flagTables = {
    npm: NPM_FLAG_MAP,
    yarn: YARN_FLAG_MAP,
    pnpm: PNPM_FLAG_MAP,
  };
  const flags = flagTables[invokedAs];
  const command = args[0];
  let rest = args.slice(1);
  let mapped = Object.hasOwn(tables[invokedAs], command)
    ? tables[invokedAs][command]
    : null;
  if (invokedAs === 'yarn' && command === 'global' && rest[0] === 'add') {
    mapped = 'add -g';
    rest = rest.slice(1);
  }
  if (!mapped) return fallback;
  if (mapped === 'run' || mapped.startsWith('run ')) {
    // Package-manager options before the script name must not become script args.
    if (rest[0]?.startsWith('-') && mapped === 'run') return fallback;
    if (
      invokedAs === 'pnpm' &&
      rest.some((arg) => /^(-r|--recursive|--filter)(=|$)/.test(arg))
    )
      return fallback;
    if (invokedAs === 'npm') {
      // npm reads options after the script name as its own config and does
      // not forward them (`npm test --watch`); Bun would pass them on.
      const scriptArgs = mapped === 'run' ? rest.slice(1) : rest;
      const end = scriptArgs.indexOf('--');
      const own = end < 0 ? scriptArgs : scriptArgs.slice(0, end);
      if (own.some((arg) => arg.startsWith('-'))) return fallback;
    }
    if (rest[1] === '--' && mapped === 'run')
      rest = [rest[0], ...rest.slice(2)];
    else if (mapped !== 'run' && rest[0] === '--') rest = rest.slice(1);
    return {
      useBunx: false,
      bunArgs: [...mapped.split(' '), ...rest],
      fallbackTo: null,
    };
  }
  if (mapped === 'x')
    return rest.length && !rest[0].startsWith('-')
      ? { useBunx: true, bunArgs: rest, fallbackTo: null }
      : fallback;
  for (let i = 0; i < rest.length; i++) {
    const [flag] = rest[i].split('=');
    if (flag === '--') break;
    if (flag.startsWith('-') && !Object.hasOwn(flags, flag)) return fallback;
    // ponytail: only --registry takes a value; any other `--flag=value`
    // (`--save=false`, `-D=false`) stays native rather than being dropped
    // or reinterpreted. Translate specific spellings only if users need it.
    if (flag.startsWith('-') && flag !== '--registry' && rest[i].includes('='))
      return fallback;
    if (flag === '--registry' && !rest[i].includes('=')) {
      if (!rest[++i] || rest[i].startsWith('-')) return fallback;
    }
  }
  if (
    invokedAs === 'npm' &&
    ['install', 'i', 'add'].includes(command) &&
    !hasNonFlagArgs(rest)
  ) {
    // npm installs the current folder as a global package; bun install -g
    // does not, so keep npm's meaning.
    if (rest.some((arg) => arg === '-g' || arg === '--global')) return fallback;
    mapped = 'install';
  }
  return {
    useBunx: false,
    bunArgs: [...mapped.split(' '), ...translateFlags(rest, flags)],
    fallbackTo: null,
  };
}

module.exports = {
  mapCommand,
  validateArgs,
  translateFlags,
  hasNonFlagArgs,
};
