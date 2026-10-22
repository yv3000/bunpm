const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { parseTapSummary } = require('../scripts/check-no-skips');

describe('TAP no-skips assertion', () => {
  test('parseTapSummary extracts summary counts from TAP text', () => {
    const tap = [
      'TAP version 13',
      'ok 1 - test a',
      'ok 2 - test b',
      '# tests 2',
      '# pass 2',
      '# fail 0',
      '# skipped 0',
    ].join('\n');
    assert.deepEqual(parseTapSummary(tap), {
      tests: 2,
      pass: 2,
      fail: 0,
      skipped: 0,
    });
  });

  test('parseTapSummary detects skipped and failed tests', () => {
    const tap = ['# tests 3', '# pass 1', '# fail 1', '# skipped 1'].join('\n');
    assert.deepEqual(parseTapSummary(tap), {
      tests: 3,
      pass: 1,
      fail: 1,
      skipped: 1,
    });
  });

  test('parseTapSummary handles empty or missing sections', () => {
    assert.deepEqual(parseTapSummary(''), {
      tests: 0,
      pass: 0,
      fail: 0,
      skipped: 0,
    });
  });
});
