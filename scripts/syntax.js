const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function check(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) check(file);
    else if (
      file.endsWith('.js') ||
      /platforms[\\/]windows[\\/]bin[\\/][^.]+$/.test(file)
    ) {
      const result = spawnSync(process.execPath, ['--check', file], {
        stdio: 'inherit',
      });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
check('.');
