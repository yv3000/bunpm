const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  formatLine,
  formatOutput,
  formatStream,
  formatAsNpm,
  formatAsYarn,
  formatAsPnpm,
  parseBunInstallLine,
} = require('../bunpm/core/formatter');

test('parses scoped packages and formats known output, preserving unknown lines', () => {
  assert.deepEqual(parseBunInstallLine('  installed @scope/pkg@1.2.3'), {
    type: 'single',
    name: '@scope/pkg',
    version: '1.2.3',
  });
  assert.deepEqual(parseBunInstallLine('  2 packages installed [12ms]'), {
    type: 'count',
    count: 2,
    time: '12ms',
  });
  assert.equal(parseBunInstallLine('not install output'), null);
  for (const invokedAs of ['npm', 'yarn', 'pnpm']) {
    const context = { invokedAs, subcommand: 'add' };
    assert.equal(
      formatLine('unrecognized diagnostic', context),
      'unrecognized diagnostic',
    );
    assert.equal(
      formatOutput('bun add v1.3.14\nunrecognized diagnostic', context),
      'unrecognized diagnostic',
    );
    assert.ok(formatLine('error: failed', context).includes('failed'));
  }
  assert.equal(
    formatLine('  2 packages installed [12ms]', {
      invokedAs: 'npm',
      subcommand: 'add',
    }),
    'added 2 packages in 12ms',
  );
});

test('formatter recognises Bun 1.3 piped output, which is not indented', () => {
  // Captured from `bun add is-number@7.0.0` and a repeated `bun install`
  // with stdout piped, which is how the wrapper always runs installs.
  const added = [
    'bun add v1.3.14 (0d9b296a)',
    'Saved lockfile',
    '',
    'installed is-number@7.0.0',
    '',
    '1 package installed [275.00ms]',
  ].join('\n');
  const unchanged =
    'Checked 1 install across 2 packages (no changes) [14.00ms]';
  const npm = { invokedAs: 'npm', subcommand: 'add' };
  assert.equal(
    formatOutput(added, npm),
    'Saved lockfile\n\nadded is-number@7.0.0\n\nadded 1 package in 275.00ms',
  );
  assert.equal(formatLine(unchanged, npm), 'up to date');
  const yarn = { invokedAs: 'yarn', subcommand: 'add' };
  assert.ok(
    formatLine('installed is-number@7.0.0', yarn).includes(
      '└─ is-number@7.0.0',
    ),
  );
  assert.equal(formatLine(unchanged, yarn), 'success Already up-to-date.');
  const pnpm = { invokedAs: 'pnpm', subcommand: 'add' };
  assert.equal(
    formatLine('1 package installed [2ms]', pnpm),
    'Packages: +1\n+',
  );
  assert.equal(formatLine(unchanged, pnpm), 'Already up to date');
});

test('formatter styles actual install counts and leaves versions unmodified', () => {
  for (const invokedAs of ['npm', 'yarn', 'pnpm']) {
    const context = { invokedAs, subcommand: 'add' };
    assert.ok(
      formatLine('  installed @scope/pkg@1.0.0', context).includes(
        '@scope/pkg',
      ),
    );
    assert.ok(formatLine('  1 package installed [1ms]', context).includes('1'));
    assert.ok(
      formatLine('  2 packages installed [2ms]', context).includes('2'),
    );
    assert.ok(!formatLine('  0 packages installed', context).includes('audit'));
    assert.equal(
      formatLine('Done in 1s', context),
      invokedAs === 'npm'
        ? null
        : invokedAs === 'yarn'
          ? 'Done in 1s.'
          : 'Done in 1s',
    );
    assert.equal(formatLine('$ build', { invokedAs, subcommand: 'run' }), null);
    assert.equal(formatLine('bun unknown', context), null);
    assert.equal(
      formatLine('1.3.14', { invokedAs, subcommand: '--version' }),
      '1.3.14',
    );
  }
});

test('dedicated manager formatters transform lines according to their CLI style', () => {
  const context = { invokedAs: 'npm', subcommand: 'add' };
  assert.equal(formatAsNpm('bun add v1.3.14', context), null);
  assert.equal(
    formatAsNpm('  installed foo@1.0.0', context),
    '  added foo@1.0.0',
  );
  assert.equal(formatAsNpm('Done in 50ms', context), null);
  assert.equal(
    formatAsNpm('error: missing package', context),
    'npm error missing package',
  );

  const yarnContext = { invokedAs: 'yarn', subcommand: 'add' };
  assert.equal(formatAsYarn('bun add v1.3.14', yarnContext), null);
  assert.equal(formatAsYarn('Done in 50ms', yarnContext), 'Done in 50ms.');
  assert.equal(formatAsYarn('error: failed', yarnContext), 'error failed');

  const pnpmContext = { invokedAs: 'pnpm', subcommand: 'add' };
  assert.equal(formatAsPnpm('bun add v1.3.14', pnpmContext), null);
  assert.equal(formatAsPnpm('Done in 50ms', pnpmContext), 'Done in 50ms');
  assert.equal(formatAsPnpm('error: failed', pnpmContext), 'ERR_PNPM failed');
});

/**
 * @param {Buffer[]} chunks
 * @param {{ invokedAs: string, subcommand: string }} context
 */
function streamed(chunks, context) {
  const source = new EventEmitter();
  /** @type {string[]} */
  const writes = [];
  formatStream(source, (text) => writes.push(text), context);
  for (const chunk of chunks) source.emit('data', chunk);
  source.emit('end');
  return writes;
}

test('formatStream writes formatted lines and keeps split characters intact', () => {
  const npm = { invokedAs: 'npm', subcommand: 'install' };
  const check = Buffer.from('✓\n');
  assert.deepEqual(
    streamed(
      [
        Buffer.from('bun install v1.3.14\n  2 packa'),
        Buffer.from('ges installed [1ms]\n'),
        check.subarray(0, 2),
        check.subarray(2),
      ],
      npm,
    ),
    ['added 2 packages in 1ms\n', '✓\n'],
  );
  // Multi-line replacements are written whole; an unterminated tail on 'end'.
  assert.deepEqual(
    streamed([Buffer.from('installed a@1\nDone in 5ms')], {
      invokedAs: 'yarn',
      subcommand: 'add',
    }),
    [
      'success Saved 1 new dependency.\ninfo Direct dependencies\n└─ a@1\n',
      'Done in 5ms.',
    ],
  );
  assert.deepEqual(streamed([], npm), []);
  // The one allowed difference from formatOutput: a dropped final fragment.
  assert.deepEqual(streamed([Buffer.from('x\nbun add v1.3.14')], npm), ['x\n']);
});

test('formatStream equals formatOutput for any chunking (seeded)', () => {
  // mulberry32: a deterministic generator, so failures are reproducible.
  let seed = 0xb0b;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** @param {string[]} items */
  const pick = (items) => items[Math.floor(rand() * items.length)];
  const corpus = [
    'bun add v1.3.14 (abc)',
    'installed lodash@4.17.21',
    '  2 packages installed [1.00ms]',
    'Done in 12ms',
    'error: boom ✗',
    'Checked 1 install across 2 packages (no changes) [1ms]',
    '$ echo hi',
    '',
    'héllo 日本語 🎉',
    'crlf\r',
  ];
  for (let i = 0; i < 200; i++) {
    const context = {
      invokedAs: pick(['npm', 'yarn', 'pnpm']),
      subcommand: pick(['install', 'add', 'run']),
    };
    const lines = Array.from({ length: 1 + Math.floor(rand() * 6) }, () =>
      pick(corpus),
    );
    const text = lines.join('\n') + '\n';
    const bytes = Buffer.from(text);
    /** @type {number[]} */
    const cuts = [];
    for (let at = 1; at < bytes.length; at++) if (rand() < 0.3) cuts.push(at);
    const chunks = [0, ...cuts].map((start, n) =>
      bytes.subarray(start, cuts[n] ?? bytes.length),
    );
    assert.equal(
      streamed(chunks, context).join(''),
      formatOutput(text, context),
      `i ${i} cuts ${cuts.join(',')}`,
    );
    const everyByte = [...bytes].map((byte) => Buffer.from([byte]));
    assert.equal(
      streamed(everyByte, context).join(''),
      formatOutput(text, context),
    );
  }
});
