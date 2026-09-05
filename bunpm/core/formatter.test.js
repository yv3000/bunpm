// core/formatter.test.js
// Unit tests for core/formatter.js — run with `bun test core/`.
// Every input string below is a real line shape emitted by bun 1.1.x;
// the assertions describe what npm, yarn classic, and pnpm print instead.

const { describe, it, expect } = require('bun:test');

const {
  formatLine,
  formatOutput,
  formatAsNpm,
  formatAsYarn,
  formatAsPnpm,
  parseBunInstallLine,
} = require('./formatter');

const npmCtx = { invokedAs: 'npm', subcommand: 'add' };
const yarnCtx = { invokedAs: 'yarn', subcommand: 'add' };
const pnpmCtx = { invokedAs: 'pnpm', subcommand: 'add' };

describe('parseBunInstallLine()', () => {
  it('parses a single-package install line', () => {
    expect(parseBunInstallLine('  installed express@4.18.2')).toEqual({
      type: 'single',
      name: 'express',
      version: '4.18.2',
    });
  });

  it('parses a package-count summary line with its timing', () => {
    expect(parseBunInstallLine('  57 packages installed [1.21s]')).toEqual({
      type: 'count',
      count: 57,
      time: '1.21s',
    });
  });

  it('accepts the singular "1 package installed" wording', () => {
    expect(parseBunInstallLine('  1 package installed [340ms]')).toEqual({
      type: 'count',
      count: 1,
      time: '340ms',
    });
  });

  it('returns null for lines that are neither shape', () => {
    expect(parseBunInstallLine('bun add v1.1.38')).toBeNull();
    expect(parseBunInstallLine('installed express@4.18.2')).toBeNull(); // no leading indent
    expect(parseBunInstallLine('')).toBeNull();
  });
});

describe('npm output style', () => {
  it('suppresses the bun version banner', () => {
    expect(formatLine('bun add v1.1.38', npmCtx)).toBeNull();
    expect(formatLine('bun install v1.1.38', npmCtx)).toBeNull();
    expect(formatLine('bun remove v1.1.38', npmCtx)).toBeNull();
  });

  it('rewrites "installed" as npm\'s "added", keeping the indent', () => {
    expect(formatLine('  installed express@4.18.2', npmCtx)).toBe('  added express@4.18.2');
  });

  it('rewrites the count summary into npm\'s "added N packages in T"', () => {
    expect(formatLine('  1 package installed [1.21s]', npmCtx)).toBe('added 1 packages in 1.21s');
    expect(formatLine('  57 packages installed [3.4s]', npmCtx)).toBe(
      'added 57 packages in 3.4s'
    );
  });

  it('rewrites a zero-package install as npm\'s up-to-date line', () => {
    expect(formatLine('  0 packages installed', npmCtx)).toBe(
      'up to date, audited 0 packages in 0s'
    );
  });

  it('suppresses bun\'s "$ <cmd>" script echo during `run`', () => {
    expect(formatLine('$ vite', { invokedAs: 'npm', subcommand: 'run' })).toBeNull();
  });

  it('keeps a "$ " line when the subcommand is not `run`', () => {
    expect(formatLine('$ vite', npmCtx)).toBe('$ vite');
  });

  it('rewrites bun errors with npm\'s error prefix', () => {
    expect(formatLine('error: something went wrong', npmCtx)).toBe(
      'npm error something went wrong'
    );
  });

  it('suppresses "Done in" only for add, where npm prints nothing', () => {
    expect(formatLine('Done in 1.21s', npmCtx)).toBeNull();
    expect(formatLine('Done in 1.21s', { invokedAs: 'npm', subcommand: 'install' })).toBe(
      'Done in 1.21s'
    );
  });

  it('keeps `bun run` lines but drops other stray bun-prefixed lines', () => {
    expect(formatLine('bun run v1.1.38', npmCtx)).toBe('bun run v1.1.38');
    expect(formatLine('bun resolving dependencies', npmCtx)).toBeNull();
  });

  it('reports npm\'s version number for version subcommands', () => {
    expect(formatAsNpm('1.1.38', { invokedAs: 'npm', subcommand: '--version' })).toBe('10.8.2');
    expect(formatAsNpm('1.1.38', { invokedAs: 'npm', subcommand: 'version' })).toBe('10.8.2');
  });

  it('passes unrecognised lines through untouched', () => {
    expect(formatLine('some unrelated output', npmCtx)).toBe('some unrelated output');
  });
});

describe('yarn output style', () => {
  it('suppresses the bun version banner', () => {
    expect(formatLine('bun add v1.1.38', yarnCtx)).toBeNull();
  });

  it('renders a single install as yarn\'s success + dependency tree', () => {
    const out = formatLine('  installed express@4.18.2', yarnCtx);
    expect(out).toContain('success Saved 1 new dependency.');
    expect(out).toContain('info Direct dependencies');
    expect(out).toContain('└─ express@4.18.2');
  });

  it('pluralises the saved-dependency count correctly', () => {
    expect(formatLine('  1 package installed [1.21s]', yarnCtx)).toBe(
      'success Saved 1 new dependency.'
    );
    expect(formatLine('  57 packages installed [3.4s]', yarnCtx)).toBe(
      'success Saved 57 new dependencies.'
    );
  });

  it('renders a zero-package install as yarn\'s already-up-to-date line', () => {
    expect(formatLine('  0 packages installed', yarnCtx)).toBe('success Already up-to-date.');
  });

  it('reformats "Done in" with yarn\'s trailing period', () => {
    expect(formatLine('Done in 1.21s', yarnCtx)).toBe('Done in 1.21s.');
  });

  it('reports yarn classic\'s version number for version subcommands', () => {
    expect(formatAsYarn('1.1.38', { invokedAs: 'yarn', subcommand: '--version' })).toBe('1.22.22');
  });

  it('keeps yarn\'s bare "error" prefix', () => {
    expect(formatLine('error: no lockfile found', yarnCtx)).toBe('error no lockfile found');
  });
});

describe('pnpm output style', () => {
  it('suppresses the bun version banner', () => {
    expect(formatLine('bun add v1.1.38', pnpmCtx)).toBeNull();
  });

  it('renders a single install as pnpm\'s Packages/dependencies block', () => {
    const out = formatLine('  installed express@4.18.2', pnpmCtx);
    expect(out).toContain('Packages: +1');
    expect(out).toContain('dependencies:');
    expect(out).toContain('+ express 4.18.2');
  });

  it('renders the count summary as pnpm\'s "Packages: +N"', () => {
    const out = formatLine('  1 package installed [1.21s]', pnpmCtx);
    expect(out).toContain('Packages: +1');
    expect(formatLine('  57 packages installed [3.4s]', pnpmCtx)).toContain('Packages: +57');
  });

  it('renders a zero-package install as pnpm\'s already-up-to-date line', () => {
    expect(formatLine('  0 packages installed', pnpmCtx)).toBe('Already up to date');
  });

  it('rewrites errors with pnpm\'s ERR_PNPM prefix', () => {
    expect(formatLine('error: something', pnpmCtx)).toContain('ERR_PNPM');
    expect(formatLine('error: something', pnpmCtx)).toBe('ERR_PNPM something');
  });

  it('reports pnpm\'s version number for version subcommands', () => {
    expect(formatAsPnpm('1.1.38', { invokedAs: 'pnpm', subcommand: '--version' })).toBe('9.12.0');
  });
});

describe('formatLine() dispatch', () => {
  it('routes to the yarn formatter for invokedAs "yarn"', () => {
    const line = '  installed express@4.18.2';
    expect(formatLine(line, yarnCtx)).toBe(formatAsYarn(line, yarnCtx));
  });

  it('routes to the pnpm formatter for invokedAs "pnpm"', () => {
    const line = '  installed express@4.18.2';
    expect(formatLine(line, pnpmCtx)).toBe(formatAsPnpm(line, pnpmCtx));
  });

  it('defaults to the npm formatter for anything else', () => {
    const line = '  installed express@4.18.2';
    expect(formatLine(line, { invokedAs: 'npx', subcommand: 'add' })).toBe(
      formatAsNpm(line, npmCtx)
    );
  });
});

describe('formatOutput()', () => {
  it('formats a whole bun transcript and drops suppressed lines', () => {
    const raw = ['bun add v1.1.38', '', '  installed express@4.18.2', '', '  1 package installed [1.21s]'].join(
      '\n'
    );
    expect(formatOutput(raw, npmCtx)).toBe(
      ['', '  added express@4.18.2', '', 'added 1 packages in 1.21s'].join('\n')
    );
  });

  it('returns an empty string when every line is suppressed', () => {
    expect(formatOutput('bun add v1.1.38\nbun resolving', npmCtx)).toBe('');
  });
});
