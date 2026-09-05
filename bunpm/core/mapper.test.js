// core/mapper.test.js
// Unit tests for core/mapper.js — run with `bun test core/`.
// mapper.js is pure logic with no I/O, so every test below calls the real
// exported function and asserts on the real returned object.

const { describe, it, expect } = require('bun:test');

const {
  mapCommand,
  translateFlags,
  hasNonFlagArgs,
  NPM_FLAG_MAP,
  YARN_FLAG_MAP,
  PNPM_FLAG_MAP,
} = require('./mapper');

describe('mapCommand("npm", ...)', () => {
  it('translates `npm install <pkg>` to `bun add <pkg>`', () => {
    const result = mapCommand('npm', ['install', 'express']);
    expect(result.bunArgs).toEqual(['add', 'express']);
    expect(result.fallbackTo).toBeNull();
    expect(result.useBunx).toBe(false);
  });

  it('translates bare `npm install` to `bun install`, not `bun add`', () => {
    // This distinction is the single most important one in the whole table:
    // `bun add` with no package name is not equivalent to `bun install`.
    expect(mapCommand('npm', ['install']).bunArgs).toEqual(['install']);
    expect(mapCommand('npm', ['i']).bunArgs).toEqual(['install']);
  });

  it('treats a flag-only `npm install` as a full install', () => {
    // --production is a flag, not a package, so this is still "install all".
    expect(mapCommand('npm', ['install', '--production']).bunArgs).toEqual([
      'install',
      '--production',
    ]);
  });

  it('translates `npm uninstall <pkg>` to `bun remove <pkg>`', () => {
    expect(mapCommand('npm', ['uninstall', 'express']).bunArgs).toEqual(['remove', 'express']);
    expect(mapCommand('npm', ['rm', 'express']).bunArgs).toEqual(['remove', 'express']);
  });

  it('passes `npm run <script>` through as `bun run <script>`', () => {
    expect(mapCommand('npm', ['run', 'dev']).bunArgs).toEqual(['run', 'dev']);
  });

  it('expands `npm start` to `bun run start`', () => {
    expect(mapCommand('npm', ['start']).bunArgs).toEqual(['run', 'start']);
  });

  it('translates `npm ci` to a frozen-lockfile install', () => {
    expect(mapCommand('npm', ['ci']).bunArgs).toEqual(['install', '--frozen-lockfile']);
  });

  it('translates `npm ls` to `bun pm ls`', () => {
    expect(mapCommand('npm', ['ls']).bunArgs).toEqual(['pm', 'ls']);
    expect(mapCommand('npm', ['list']).bunArgs).toEqual(['pm', 'ls']);
  });

  it('falls back to real npm for registry commands bun cannot do', () => {
    const result = mapCommand('npm', ['publish']);
    expect(result.fallbackTo).toBe('npm');
    expect(result.fallbackArgs).toEqual(['publish']);
    expect(result.bunArgs).toBeUndefined();
  });

  it('falls back to real npm for unknown subcommands', () => {
    const result = mapCommand('npm', ['frobnicate', '--now']);
    expect(result.fallbackTo).toBe('npm');
    expect(result.fallbackArgs).toEqual(['frobnicate', '--now']);
  });

  it('handles `npm --version` without falling back', () => {
    const result = mapCommand('npm', ['--version']);
    expect(result.fallbackTo).toBeNull();
    expect(result.bunArgs).toEqual(['--version']);
    expect(mapCommand('npm', ['-v']).bunArgs).toEqual(['--version']);
  });

  it('shows help when npm is called with no arguments at all', () => {
    expect(mapCommand('npm', []).bunArgs).toEqual(['--help']);
  });

  it('matches subcommands case-insensitively', () => {
    expect(mapCommand('npm', ['INSTALL', 'express']).bunArgs).toEqual(['add', 'express']);
  });

  describe('npm flag translation', () => {
    it('maps -D to bun -d', () => {
      expect(mapCommand('npm', ['install', '-D', 'typescript']).bunArgs).toEqual([
        'add',
        '-d',
        'typescript',
      ]);
    });

    it('maps --save-dev to bun -d', () => {
      expect(mapCommand('npm', ['install', '--save-dev', 'typescript']).bunArgs).toEqual([
        'add',
        '-d',
        'typescript',
      ]);
    });

    it('drops --save entirely (bun saves by default)', () => {
      expect(mapCommand('npm', ['install', '--save', 'express']).bunArgs).toEqual([
        'add',
        'express',
      ]);
    });

    it('drops --legacy-peer-deps, which has no bun equivalent', () => {
      expect(mapCommand('npm', ['install', '--legacy-peer-deps']).bunArgs).toEqual(['install']);
    });

    it('maps --global and -g to -g', () => {
      expect(mapCommand('npm', ['install', '-g', 'typescript']).bunArgs).toEqual([
        'add',
        '-g',
        'typescript',
      ]);
      expect(mapCommand('npm', ['install', '--global', 'typescript']).bunArgs).toEqual([
        'add',
        '-g',
        'typescript',
      ]);
    });
  });
});

describe('mapCommand("yarn", ...)', () => {
  it('translates `yarn add <pkg>` to `bun add <pkg>`', () => {
    expect(mapCommand('yarn', ['add', 'express']).bunArgs).toEqual(['add', 'express']);
  });

  it('translates `yarn remove <pkg>` to `bun remove <pkg>`', () => {
    expect(mapCommand('yarn', ['remove', 'express']).bunArgs).toEqual(['remove', 'express']);
  });

  it('treats bare `yarn` as `bun install`', () => {
    expect(mapCommand('yarn', []).bunArgs).toEqual(['install']);
  });

  it('treats `yarn <pkg>` as yarn\'s implicit-add shorthand', () => {
    // Real yarn classic accepts `yarn express` as `yarn add express`.
    expect(mapCommand('yarn', ['express']).bunArgs).toEqual(['add', 'express']);
  });

  it('routes `yarn dlx <pkg>` to bunx', () => {
    const result = mapCommand('yarn', ['dlx', 'create-vite']);
    expect(result.useBunx).toBe(true);
    expect(result.bunArgs).toEqual(['create-vite']);
    expect(result.fallbackTo).toBeNull();
  });

  it('routes `yarn exec <bin>` to bunx', () => {
    const result = mapCommand('yarn', ['exec', 'eslint', '.']);
    expect(result.useBunx).toBe(true);
    expect(result.bunArgs).toEqual(['eslint', '.']);
  });

  it('slices the literal "add" out of `yarn global add <pkg>`', () => {
    // Without the slice this would become `bun add -g add typescript`
    // and bun would try to install a package literally named "add".
    expect(mapCommand('yarn', ['global', 'add', 'typescript']).bunArgs).toEqual([
      'add',
      '-g',
      'typescript',
    ]);
  });

  it('translates `yarn why <pkg>` to `bun pm why <pkg>`', () => {
    expect(mapCommand('yarn', ['why', 'express']).bunArgs).toEqual(['pm', 'why', 'express']);
  });

  it('translates `yarn upgrade` to `bun update`', () => {
    expect(mapCommand('yarn', ['upgrade']).bunArgs).toEqual(['update']);
    expect(mapCommand('yarn', ['up']).bunArgs).toEqual(['update']);
  });

  it('falls back to real yarn for auth commands', () => {
    const result = mapCommand('yarn', ['login']);
    expect(result.fallbackTo).toBe('yarn');
    expect(result.fallbackArgs).toEqual(['login']);
  });

  it('falls back to real yarn for Berry-only features', () => {
    expect(mapCommand('yarn', ['plugin', 'import', 'typescript']).fallbackTo).toBe('yarn');
    expect(mapCommand('yarn', ['workspaces', 'list']).fallbackTo).toBe('yarn');
    expect(mapCommand('yarn', ['set', 'version', 'berry']).fallbackTo).toBe('yarn');
  });

  describe('yarn flag translation', () => {
    it('maps --dev to bun -d', () => {
      expect(mapCommand('yarn', ['add', 'typescript', '--dev']).bunArgs).toEqual([
        'add',
        'typescript',
        '-d',
      ]);
    });

    it('drops --ignore-engines, which bun does not enforce', () => {
      expect(mapCommand('yarn', ['add', 'express', '--ignore-engines']).bunArgs).toEqual([
        'add',
        'express',
      ]);
    });

    it('drops -W (yarn workspace-root escape hatch)', () => {
      expect(mapCommand('yarn', ['add', '-W', 'express']).bunArgs).toEqual(['add', 'express']);
    });
  });
});

describe('mapCommand("pnpm", ...)', () => {
  it('translates `pnpm add <pkg>` to `bun add <pkg>`', () => {
    expect(mapCommand('pnpm', ['add', 'express']).bunArgs).toEqual(['add', 'express']);
  });

  it('translates `pnpm install` to `bun install`', () => {
    expect(mapCommand('pnpm', ['install']).bunArgs).toEqual(['install']);
    expect(mapCommand('pnpm', ['i']).bunArgs).toEqual(['install']);
  });

  it('treats bare `pnpm` as `bun install`', () => {
    expect(mapCommand('pnpm', []).bunArgs).toEqual(['install']);
  });

  it('translates `pnpm remove <pkg>` to `bun remove <pkg>`', () => {
    expect(mapCommand('pnpm', ['remove', 'express']).bunArgs).toEqual(['remove', 'express']);
    expect(mapCommand('pnpm', ['un', 'express']).bunArgs).toEqual(['remove', 'express']);
  });

  it('routes `pnpm dlx <pkg>` to bunx', () => {
    const result = mapCommand('pnpm', ['dlx', 'create-vite']);
    expect(result.useBunx).toBe(true);
    expect(result.bunArgs).toEqual(['create-vite']);
  });

  it('falls back to real pnpm when --filter is present anywhere', () => {
    // pnpm's workspace filter semantics are not guaranteed to match bun's,
    // so translating could silently target the wrong packages.
    const result = mapCommand('pnpm', ['install', '--filter', './packages/foo']);
    expect(result.fallbackTo).toBe('pnpm');
    expect(result.fallbackArgs).toEqual(['install', '--filter', './packages/foo']);
    expect(mapCommand('pnpm', ['add', 'express', '--filter=web']).fallbackTo).toBe('pnpm');
  });

  it('falls back to real pnpm for recursive workspace runs', () => {
    expect(mapCommand('pnpm', ['install', '-r']).fallbackTo).toBe('pnpm');
    expect(mapCommand('pnpm', ['run', 'build', '--recursive']).fallbackTo).toBe('pnpm');
  });

  it('falls back to real pnpm for store and patch commands', () => {
    expect(mapCommand('pnpm', ['store', 'prune']).fallbackTo).toBe('pnpm');
    expect(mapCommand('pnpm', ['patch', 'express']).fallbackTo).toBe('pnpm');
  });

  describe('pnpm flag translation', () => {
    it('maps --save-dev to bun -d', () => {
      expect(mapCommand('pnpm', ['add', '--save-dev', 'typescript']).bunArgs).toEqual([
        'add',
        '-d',
        'typescript',
      ]);
    });

    it('drops --reporter, which has no bun equivalent', () => {
      expect(mapCommand('pnpm', ['add', 'express', '--reporter']).bunArgs).toEqual([
        'add',
        'express',
      ]);
    });
  });
});

describe('mapCommand("npx", ...)', () => {
  it('is always a straight passthrough to bunx', () => {
    const result = mapCommand('npx', ['create-vite']);
    expect(result.useBunx).toBe(true);
    expect(result.bunArgs).toEqual(['create-vite']);
    expect(result.fallbackTo).toBeNull();
  });

  it('forwards every argument untouched, including flags', () => {
    expect(mapCommand('npx', ['create-vite', 'my-app', '--template', 'react']).bunArgs).toEqual([
      'create-vite',
      'my-app',
      '--template',
      'react',
    ]);
  });
});

describe('mapCommand() invocation guard', () => {
  it('throws on an unknown invokedAs value', () => {
    expect(() => mapCommand('brew', ['install', 'jq'])).toThrow(
      /unknown invokedAs value: "brew"/
    );
  });

  it('names the accepted values in the error message', () => {
    expect(() => mapCommand('', [])).toThrow(/npm, npx, yarn, pnpm/);
  });
});

describe('translateFlags()', () => {
  it('leaves non-flag arguments untouched', () => {
    expect(translateFlags(['express', 'lodash'], NPM_FLAG_MAP)).toEqual(['express', 'lodash']);
  });

  it('passes unknown flags through unchanged', () => {
    expect(translateFlags(['--dry-run'], NPM_FLAG_MAP)).toEqual(['--dry-run']);
  });

  it('drops flags mapped to an empty string', () => {
    expect(translateFlags(['--save', '-S'], NPM_FLAG_MAP)).toEqual([]);
    expect(translateFlags(['--ignore-engines'], YARN_FLAG_MAP)).toEqual([]);
    expect(translateFlags(['--reporter'], PNPM_FLAG_MAP)).toEqual([]);
  });

  it('preserves the value half of --flag=value forms', () => {
    expect(translateFlags(['--registry=https://example.com'], NPM_FLAG_MAP)).toEqual([
      '--registry=https://example.com',
    ]);
  });

  it('maps aliases to a single canonical bun flag', () => {
    expect(translateFlags(['-q', '--quiet', '--silent'], NPM_FLAG_MAP)).toEqual([
      '--silent',
      '--silent',
      '--silent',
    ]);
  });
});

describe('hasNonFlagArgs()', () => {
  it('is false for an empty list', () => {
    expect(hasNonFlagArgs([])).toBe(false);
  });

  it('is false when every argument is a flag', () => {
    expect(hasNonFlagArgs(['-D', '--save-exact'])).toBe(false);
  });

  it('is true as soon as one positional argument appears', () => {
    expect(hasNonFlagArgs(['-D', 'typescript'])).toBe(true);
  });
});
