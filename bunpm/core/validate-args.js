const { BunpmError } = require('./errors.js');

function validateArgs(invokedAs, args) {
  if (!['npm', 'npx', 'yarn', 'pnpm'].includes(invokedAs)) {
    throw BunpmError.invalidInvocation(invokedAs == null
      ? 'No package manager name was passed to wrapper.js.'
      : `Unknown package manager "${invokedAs}".`);
  }
  if (!Array.isArray(args)) args = [];
  for (const arg of args) {
    if (typeof arg !== 'string' || arg.length > 4096) {
      throw BunpmError.invalidInvocation('Arguments must be strings of at most 4096 characters.');
    }
  }
  return { invokedAs, args };
}

module.exports = { validateArgs };
