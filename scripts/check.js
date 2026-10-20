'use strict';
// Offline checks only: never import server.js, init a database, or call an AI provider.
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateFrontend } = require('./build');
const root = path.resolve(__dirname, '..');
async function filesIn(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', '.cache', 'backups'].includes(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesIn(full));
    else if (entry.isFile() && /\.(?:js|cjs)$/.test(entry.name)) result.push(full);
  }
  return result;
}
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Node check failed (${result.status}).`);
}
(async () => {
  const files = await filesIn(root);
  for (const file of files) run(['--check', file]);
  await validateFrontend(await fs.readFile(path.join(root, 'index.html'), 'utf8'));
  const tests = files.filter(file => file.endsWith('.test.js'));
  if (tests.length) run(['--test', ...tests]);
  console.log(`Checked ${files.length} JS files, frontend JSX, and ${tests.length} test files without database/AI access.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
