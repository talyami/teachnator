'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createWriteStream } = require('node:fs');
const { createGzip } = require('node:zlib');
const { pipeline } = require('node:stream/promises');
const { getRetentionPolicy, boundedInteger } = require('../retention_policy');
const BACKUP_FILENAME = /^fast-learning-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.sql\.gz$/;

function optionValue(value) {
  // MySQL option-file escaping; prevents line/section injection by credentials.
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
}
function defaultsFile(env) {
  const port = Number(env.DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid DB_PORT.');
  return `[client]\nhost=${optionValue(env.DB_HOST || 'localhost')}\nport=${port}\nuser=${optionValue(env.DB_USER || '')}\npassword=${optionValue(env.DB_PASSWORD || '')}\ndefault-character-set=utf8mb4\n`;
}
async function removeExpired(directory, days, now = Date.now()) {
  days = boundedInteger(days, 7, 1, 90, 'BACKUP_RETENTION_DAYS');
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !BACKUP_FILENAME.test(entry.name)) continue;
    const full = path.join(directory, entry.name);
    const stat = await fs.lstat(full);
    if (stat.isFile() && now - stat.mtimeMs > days * 86400000) await fs.unlink(full);
  }
}
function backupChildEnv(env) {
  // Never forward unrelated service secrets (including token-bearing webhook URLs).
  return Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ'].filter(key => typeof env[key] === 'string').map(key => [key, env[key]]));
}
async function backup({ env = process.env } = {}) {
  // Restrictive POSIX modes are mandatory. Windows ACLs require a separate native
  // implementation; do not silently create a world-readable credential file there.
  if (process.platform === 'win32') throw new Error('Secure backup runs on the Linux VPS only (POSIX mode 0600 required).');
  if (!env.DB_USER || !env.DB_NAME) throw new Error('DB_USER and DB_NAME are required.');
  if (!/^[A-Za-z0-9_$-]+$/.test(env.DB_NAME)) throw new Error('Unsupported DB_NAME.');
  const days = getRetentionPolicy(env).backupDays;
  const directory = path.resolve(env.BACKUP_DIR || path.join(__dirname, '..', 'backups'));
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);
  const stamp = new Date().toISOString().replace(/[.:]/g, '-');
  const destination = path.join(directory, `fast-learning-${stamp}.sql.gz`);
  const partial = `${destination}.partial`;
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'fast-learning-dump-'));
  await fs.chmod(temporary, 0o700);
  const credentials = path.join(temporary, 'client.cnf');
  let child;
  let interrupted = false;
  const onSignal = () => { interrupted = true; child?.kill('SIGTERM'); };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    await fs.writeFile(credentials, defaultsFile(env), { mode: 0o600, flag: 'wx' });
    const childEnv = backupChildEnv(env);
    child = spawn(env.MYSQLDUMP_BIN || 'mysqldump', [
      `--defaults-extra-file=${credentials}`, '--single-transaction', '--quick',
      '--no-tablespaces', '--skip-lock-tables', '--hex-blob', '--set-gtid-purged=OFF',
      '--databases', env.DB_NAME
    ], { stdio: ['ignore', 'pipe', 'pipe'], env: childEnv });
    // Do not log stderr: a client can echo connection details. Log exit code only.
    child.stderr.resume();
    const completion = new Promise((resolve, reject) => {
      child.once('error', () => reject(new Error('Could not execute mysqldump. Check MYSQLDUMP_BIN and client installation.')));
      child.once('close', code => code === 0 && !interrupted ? resolve() : reject(new Error(`mysqldump failed (exit ${code}); no completed backup created.`)));
    });
    const compression = pipeline(child.stdout, createGzip({ level: 6 }), createWriteStream(partial, { mode: 0o600, flags: 'wx' }));
    try { await Promise.all([completion, compression]); }
    catch (error) {
      child.kill('SIGTERM');
      await Promise.allSettled([completion, compression]);
      throw error;
    }
    await fs.rename(partial, destination);
    await removeExpired(directory, days);
    console.info(`Backup completed: ${path.basename(destination)} (retention ${days} days).`);
    return destination;
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await fs.rm(temporary, { recursive: true, force: true });
    await fs.rm(partial, { force: true });
  }
}
if (require.main === module) {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
  backup().catch(() => { console.error('BACKUP_FAILED'); process.exitCode = 1; });
}
module.exports = { BACKUP_FILENAME, optionValue, defaultsFile, removeExpired, backupChildEnv, backup };
