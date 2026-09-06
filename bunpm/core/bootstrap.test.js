const { it, expect } = require('bun:test');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const { CORE_FILES, PLATFORM_FILES, toLocalStagingPath } = require('../bootstrap.js');

it('maps platform paths and preserves shared paths', () => {
  expect(toLocalStagingPath('platforms/windows/bin/npm.cmd', 'windows')).toBe('bin/npm.cmd');
  expect(toLocalStagingPath('platforms/macos/scripts/install.sh', 'macos')).toBe('scripts/install.sh');
  expect(toLocalStagingPath('platforms/linux/bin/pnpm', 'linux')).toBe('bin/pnpm');
  expect(toLocalStagingPath('core/wrapper.js')).toBe('core/wrapper.js');
  expect(toLocalStagingPath('package.json')).toBe('package.json');
});

it('includes required modules and keeps platform manifests isolated', () => {
  expect(CORE_FILES).toContain('core/wrapper.js');
  expect(CORE_FILES).toContain('core/errors.js');
  expect(CORE_FILES).toContain('core/validate-args.js');
  expect(PLATFORM_FILES.windows).toContain('platforms/windows/bin/npm.cmd');
  expect(PLATFORM_FILES.macos).toContain('platforms/macos/scripts/install.sh');
  expect(PLATFORM_FILES.linux).toContain('platforms/linux/bin/pnpm');
  for (const platform of Object.keys(PLATFORM_FILES)) {
    for (const file of [...CORE_FILES, ...PLATFORM_FILES[platform]]) {
      expect(file.startsWith('core/') || file.startsWith(`platforms/${platform}/`)).toBe(true);
    }
  }
});

it('downloads only the selected manifest before invoking the installer, offline', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'bootstrap.js'), 'utf8');
  for (const [platform, nodePlatform] of Object.entries({ windows: 'win32', macos: 'darwin', linux: 'linux' })) {
    for (const statusCode of [200, 404]) {
      const downloads = [];
      const staged = [];
      const installs = [];
      const exits = [];
      const home = path.resolve('mock-home');
      const module = {};
      const client = {
        get(url, callback) {
          downloads.push(url);
          queueMicrotask(() => callback({
            statusCode,
            pipe(file) { queueMicrotask(() => file.emit('finish')); },
          }));
          return new EventEmitter();
        },
      };
      const modules = {
        fs: {
          mkdirSync() {},
          chmodSync() {},
          createWriteStream(dest) {
            staged.push(dest);
            const file = new EventEmitter();
            file.close = () => {};
            return file;
          },
        },
        path,
        https: client,
        http: client,
        os: { homedir: () => home },
        child_process: { execSync(command) { installs.push(command); } },
      };
      const mockRequire = name => {
        if (!(name in modules)) throw new Error(`Unexpected bootstrap dependency: ${name}`);
        return modules[name];
      };
      mockRequire.main = module;
      await vm.runInNewContext(source, {
        require: mockRequire,
        module,
        process: { platform: nodePlatform, env: { BUNPM_REPO_BASE: 'http://offline.test' }, exit: code => exits.push(code) },
        console: { log() {}, error() {} },
      });
      const files = [...CORE_FILES, ...PLATFORM_FILES[platform], 'package.json'];
      if (statusCode === 200) {
        expect(downloads).toEqual(files.map(file => `http://offline.test/${file}`));
        expect(staged).toEqual(files.map(file => path.join(home, 'bunpm', toLocalStagingPath(file, platform))));
        expect(installs).toHaveLength(1);
        expect(installs[0]).toContain(path.join(home, 'bunpm', 'scripts', platform === 'windows' ? 'install.ps1' : 'install.sh'));
        expect(exits).toEqual([]);
      } else {
        expect(downloads).toHaveLength(1);
        expect(installs).toEqual([]);
        expect(exits).toEqual([1]);
      }
    }
  }
});
