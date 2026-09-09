const { test, expect, beforeEach, afterEach, spyOn } = require('bun:test');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const {
  download,
  validateUrl,
  filesFor,
  detectPlatform,
  main,
} = require('../bunpm/bootstrap');
const sha = 'a'.repeat(40);
const base = `https://raw.githubusercontent.com/yv3000/bunpm/${sha}/bunpm/`;
let server, root, get, handler;
const savedTemp = {
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  TMPDIR: process.env.TMPDIR,
};
const mocks = [];
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-http-'));
  handler = (_request, response) => response.end('complete');
  server = http.createServer((request, response) => handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  // Only the transport is redirected. Production URL validation still runs on
  // every hop; no live network and no insecure production test switch.
  get = spyOn(https, 'get').mockImplementation((url, options, callback) =>
    http.get(
      `http://127.0.0.1:${server.address().port}${url.pathname}`,
      options,
      callback,
    ),
  );
});
afterEach(async () => {
  get.mockRestore();
  for (const mock of mocks.splice(0)) mock.mockRestore();
  for (const [key, value] of Object.entries(savedTemp)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
});

test('bootstrap validates platform, manifest and URL trust boundary', () => {
  for (const [native, platform] of [
    ['win32', 'windows'],
    ['darwin', 'macos'],
    ['linux', 'linux'],
  ]) {
    expect(detectPlatform(native)).toBe(platform);
    expect(filesFor(platform)).toContain('core/wrapper.js');
    expect(
      filesFor(platform)
        .filter((file) => file.startsWith('platforms/'))
        .every((file) => file.startsWith(`platforms/${platform}/`)),
    ).toBe(true);
  }
  expect(() => detectPlatform('aix')).toThrow();
  expect(() => filesFor('other')).toThrow();
  expect(validateUrl(base + 'core/wrapper.js').protocol).toBe('https:');
  for (const url of [
    'file:///tmp/x',
    'http://raw.githubusercontent.com/x',
    base.replace('raw.githubusercontent.com', 'evil.test'),
    base.replace(sha, 'main'),
    base + 'x?token=x',
    base + 'x#hash',
    base.replace('https://', 'https://user:pass@'),
    base.replace('.com/', '.com:444/'),
  ])
    expect(() => validateUrl(url)).toThrow();
});

test('invalid limits and network failures fail before installation', async () => {
  for (const options of [
    { timeoutMs: 0 },
    { timeoutMs: NaN },
    { maxBytes: -1 },
    { maxBytes: Infinity },
  ]) {
    await expect(
      download(base + 'x', path.join(root, 'bad'), options),
    ).rejects.toThrow('limits');
  }
  handler = (request, _response) => request.socket.destroy();
  await expect(
    download(base + 'x', path.join(root, 'bad'), { timeoutMs: 150 }),
  ).rejects.toThrow();
  expect(fs.existsSync(path.join(root, 'bad'))).toBe(false);
});

test('downloads publish only complete content and follow safe relative redirects', async () => {
  handler = (request, response) => {
    if (request.url.endsWith('/redirect')) {
      response.writeHead(307, { location: 'final' });
      response.end();
    } else response.end('complete script');
  };
  const dest = path.join(root, 'script');
  await download(base + 'redirect', dest);
  expect(fs.readFileSync(dest, 'utf8')).toBe('complete script');
  expect(fs.existsSync(dest + '.partial')).toBe(false);
  expect(get).toHaveBeenCalledTimes(2);
});

test('rejects redirects across host, revision, protocol and redirect loops', async () => {
  for (const location of [
    'https://evil.test/x',
    'http://raw.githubusercontent.com/x',
    base.replace(sha, 'b'.repeat(40)) + 'x',
    base + 'loop',
  ]) {
    handler = (_request, response) => {
      response.writeHead(302, { location });
      response.end();
    };
    await expect(
      download(base + 'x', path.join(root, 'bad')),
    ).rejects.toThrow();
    expect(fs.existsSync(path.join(root, 'bad'))).toBe(false);
  }
  handler = (_request, response) => {
    response.writeHead(301);
    response.end();
  };
  await expect(download(base + 'x', path.join(root, 'bad'))).rejects.toThrow(
    'redirect',
  );
});

test('HTTP, empty, size, timeout and truncated stream errors leave no executable output', async () => {
  const dest = path.join(root, 'script');
  const cases = [
    (_request, response) => {
      response.writeHead(404);
      response.end();
    },
    (_request, response) => response.end(),
    (_request, response) => response.end('x'.repeat(100)),
    (_request, _response) => {},
    (_request, response) => {
      response.write('started');
    },
    (_request, response) => {
      response.writeHead(200, { 'Content-Length': '100' });
      response.end('partial');
    },
  ];
  for (const behavior of cases) {
    handler = behavior;
    await expect(
      download(base + 'x', dest, { timeoutMs: 150, maxBytes: 20 }),
    ).rejects.toThrow();
    expect(fs.existsSync(dest)).toBe(false);
    expect(fs.existsSync(dest + '.partial')).toBe(false);
  }
});

test('file open, write and rename failures propagate without replacing existing data', async () => {
  const dest = path.join(root, 'script');
  fs.writeFileSync(dest, 'existing');
  fs.writeFileSync(dest + '.partial', 'unrelated');
  await expect(download(base + 'x', dest)).rejects.toThrow();
  expect(fs.readFileSync(dest, 'utf8')).toBe('existing');
  expect(fs.readFileSync(dest + '.partial', 'utf8')).toBe('unrelated');
  fs.rmSync(dest + '.partial');
  const write = spyOn(fs, 'createWriteStream').mockImplementation(
    (_file, { fd }) => {
      fs.closeSync(fd);
      throw new Error('write failed');
    },
  );
  try {
    await expect(download(base + 'x', dest)).rejects.toThrow('write failed');
  } finally {
    write.mockRestore();
  }
  const rename = spyOn(fs, 'renameSync').mockImplementation(() => {
    throw new Error('rename failed');
  });
  try {
    await expect(download(base + 'x', dest)).rejects.toThrow('rename failed');
  } finally {
    rename.mockRestore();
  }
  expect(fs.readFileSync(dest, 'utf8')).toBe('existing');
  expect(fs.existsSync(dest + '.partial')).toBe(false);
});

test('bootstrap never executes incomplete files and cleans each private download directory', async () => {
  const spawn = spyOn(cp, 'spawnSync').mockImplementation(() => ({
    status: 0,
  }));
  mocks.push(spawn);
  process.env.TEMP = root;
  process.env.TMP = root;
  process.env.TMPDIR = root;
  await expect(main([])).rejects.toThrow('Usage');
  await expect(main(['--revision', 'main'])).rejects.toThrow('Usage');
  handler = (_request, response) => {
    response.writeHead(500);
    response.end();
  };
  await expect(main(['--revision', sha])).rejects.toThrow('HTTP 500');
  expect(spawn).not.toHaveBeenCalled();
  expect(fs.readdirSync(root)).toEqual([]);
  handler = (_request, response) => response.end('complete');
  await main(['--revision', sha]);
  expect(spawn).toHaveBeenCalledTimes(1);
  expect(spawn.mock.calls[0][2].shell).toBe(false);
  expect(fs.readdirSync(root)).toEqual([]);
  spawn.mockImplementation(() => ({ status: 9 }));
  await expect(main(['--revision', sha])).rejects.toThrow('Installer failed');
  spawn.mockImplementation(() => ({ error: new Error('spawn failed') }));
  await expect(main(['--revision', sha])).rejects.toThrow('spawn failed');
  expect(fs.readdirSync(root)).toEqual([]);
});
