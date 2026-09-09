module.exports = [
  {
    ignores: ['node_modules/**'],
  },
  {
    files: ['**/*.js', 'bunpm/platforms/windows/bin/*'],
    ignores: ['**/*.cmd'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: Object.fromEntries(
        [
          'process',
          '__dirname',
          '__filename',
          'console',
          'Buffer',
          'AbortController',
          'URL',
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
        ].map((name) => [name, 'readonly']),
      ),
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'error',
        { caughtErrors: 'none', argsIgnorePattern: '^_' },
      ],
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-fallthrough': 'error',
      'no-unsafe-finally': 'error',
      'no-prototype-builtins': 'error',
      eqeqeq: 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
    },
  },
];
