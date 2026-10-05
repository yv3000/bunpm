const { test, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
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
const { locateBinary } = require('../bunpm/core/detector');
const sha = 'a'.repeat(40);
const base = `https://raw.githubusercontent.com/yv3000/bunpm/${sha}/bunpm/`;
let server, root, get, handler;
const savedTemp = {
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  TMPDIR: process.env.TMPDIR,
};
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-http-'));
  handler = (_request, response) => response.end('complete');
  server = http.createServer((request, response) => handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  // Only the transport is redirected. Production URL validation still runs on
  // every hop; no live network and no insecure production test switch.
  get = mock.method(https, 'get', (url, options, callback) =>
    http.get(
      `http://127.0.0.1:${server.address().port}${url.pathname}`,
      options,
      callback,
    ),
  );
});
afterEach(async () => {
  mock.restoreAll();
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
    assert.equal(detectPlatform(native), platform);
    assert.ok(filesFor(platform).includes('core/wrapper.js'));
    assert.equal(
      filesFor(platform)
        .filter((file) => file.startsWith('platforms/'))
        .every((file) => file.startsWith(`platforms/${platform}/`)),
      true,
    );
  }
  assert.throws(() => detectPlatform('aix'));
  assert.throws(() => filesFor('other'));
  assert.equal(validateUrl(base + 'core/wrapper.js').protocol, 'https:');
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
    assert.throws(() => validateUrl(url));
});

test('invalid limits and network failures fail before installation', async () => {
  for (const options of [
    { timeoutMs: 0 },
    { timeoutMs: NaN },
    { maxBytes: -1 },
    { maxBytes: Infinity },
  ]) {
    await assert.rejects(
      download(base + 'x', path.join(root, 'bad'), options),
      /limits/,
    );
  }
  handler = (request, _response) => request.socket.destroy();
  await assert.rejects(
    download(base + 'x', path.join(root, 'bad'), { timeoutMs: 150 }),
  );
  assert.equal(fs.existsSync(path.join(root, 'bad')), false);
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
  assert.equal(fs.readFileSync(dest, 'utf8'), 'complete script');
  assert.equal(fs.existsSync(dest + '.partial'), false);
  assert.equal(get.mock.callCount(), 2);
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
    await assert.rejects(download(base + 'x', path.join(root, 'bad')));
    assert.equal(fs.existsSync(path.join(root, 'bad')), false);
  }
  handler = (_request, response) => {
    response.writeHead(301);
    response.end();
  };
  await assert.rejects(
    download(base + 'x', path.join(root, 'bad')),
    /redirect/,
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
    await assert.rejects(
      download(base + 'x', dest, { timeoutMs: 150, maxBytes: 20 }),
    );
    assert.equal(fs.existsSync(dest), false);
    assert.equal(fs.existsSync(dest + '.partial'), false);
  }
});

test('file open, write and rename failures propagate without replacing existing data', async () => {
  const dest = path.join(root, 'script');
  fs.writeFileSync(dest, 'existing');
  fs.writeFileSync(dest + '.partial', 'unrelated');
  await assert.rejects(download(base + 'x', dest));
  assert.equal(fs.readFileSync(dest, 'utf8'), 'existing');
  assert.equal(fs.readFileSync(dest + '.partial', 'utf8'), 'unrelated');
  fs.rmSync(dest + '.partial');
  const write = mock.method(fs, 'createWriteStream', (_file, { fd }) => {
    fs.closeSync(fd);
    throw new Error('write failed');
  });
  try {
    await assert.rejects(download(base + 'x', dest), /write failed/);
  } finally {
    write.mock.restore();
  }
  const rename = mock.method(fs, 'renameSync', () => {
    throw new Error('rename failed');
  });
  try {
    await assert.rejects(download(base + 'x', dest), /rename failed/);
  } finally {
    rename.mock.restore();
  }
  assert.equal(fs.readFileSync(dest, 'utf8'), 'existing');
  assert.equal(fs.existsSync(dest + '.partial'), false);
});

test('bootstrap never executes incomplete files and cleans each private download directory', async () => {
  const spawn = mock.method(cp, 'spawnSync', () => ({
    status: 0,
  }));
  process.env.TEMP = root;
  process.env.TMP = root;
  process.env.TMPDIR = root;
  await assert.rejects(main([]), /Usage/);
  await assert.rejects(main(['--revision', 'main']), /Usage/);
  handler = (_request, response) => {
    response.writeHead(500);
    response.end();
  };
  await assert.rejects(main(['--revision', sha]), /HTTP 500/);
  assert.equal(spawn.mock.callCount(), 0);
  assert.deepEqual(fs.readdirSync(root), []);
  handler = (_request, response) => response.end('complete');
  await main(['--revision', sha]);
  assert.equal(spawn.mock.callCount(), 1);
  assert.equal(spawn.mock.calls[0].arguments[2].shell, false);
  assert.deepEqual(fs.readdirSync(root), []);
  spawn.mock.mockImplementation(() => ({ status: 9 }));
  await assert.rejects(main(['--revision', sha]), /Installer failed/);
  spawn.mock.mockImplementation(() => ({ error: new Error('spawn failed') }));
  await assert.rejects(main(['--revision', sha]), /spawn failed/);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('bootstrap CLI reports usage with the shared diagnostic prefix', () => {
  // Run the documented `node bootstrap.js` entrypoint, the production invocation.
  const node = locateBinary('node');
  assert.notEqual(node, null);
  // Argument validation fails before any request, so this stays offline.
  const result = cp.spawnSync(node, [path.resolve('bunpm/bootstrap.js')], {
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(
    result.stderr.trim(),
    'bunpm: bootstrap: Usage: node bootstrap.js --revision <40-character commit SHA>',
  );
});
