// Only translate the common subset; unknown commands/options stay native.
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
const PNPM_FLAG_MAP = { ...NPM_FLAG_MAP };
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
const PNPM_TO_BUN = {
  ...NPM_TO_BUN,
  install: 'install',
  i: 'install',
  why: 'pm why',
  dlx: 'x',
};

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

function translateFlags(args, flagMap) {
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

function mapCommand(invokedAs, args) {
  if (!['npm', 'npx', 'yarn', 'pnpm'].includes(invokedAs)) {
    throw new TypeError('Expected one of: npm, npx, yarn, pnpm');
  }
  validateArgs(args);
  const fallback = { fallbackTo: invokedAs, fallbackArgs: args };
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
  const tables = { npm: NPM_TO_BUN, yarn: YARN_TO_BUN, pnpm: PNPM_TO_BUN };
  const flags = { npm: NPM_FLAG_MAP, yarn: YARN_FLAG_MAP, pnpm: PNPM_FLAG_MAP }[
    invokedAs
  ];
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
    if (flag === '--registry' && !rest[i].includes('=')) {
      if (!rest[++i] || rest[i].startsWith('-')) return fallback;
    }
  }
  if (
    invokedAs === 'npm' &&
    ['install', 'i', 'add'].includes(command) &&
    !hasNonFlagArgs(rest)
  )
    mapped = 'install';
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
  mapNpmCommand: (args) => mapCommand('npm', args),
  mapYarnCommand: (args) => mapCommand('yarn', args),
  mapPnpmCommand: (args) => mapCommand('pnpm', args),
  NPM_TO_BUN,
  YARN_TO_BUN,
  PNPM_TO_BUN,
  NPM_FLAG_MAP,
  YARN_FLAG_MAP,
  PNPM_FLAG_MAP,
};
