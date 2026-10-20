'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { defaultsFile, removeExpired, BACKUP_FILENAME, backupChildEnv } = require('./backup');
const { getRetentionPolicy } = require('../retention_policy');
test('backup uses bounded shared retention and owned timestamped completed names', () => {
  assert.equal(getRetentionPolicy({}).backupDays, 7);
  assert.equal(getRetentionPolicy({ BACKUP_RETENTION_DAYS: '14' }).backupDays, 14);
  assert.throws(() => getRetentionPolicy({ BACKUP_RETENTION_DAYS: '999' }), /BACKUP_RETENTION_DAYS/);
  assert.ok(BACKUP_FILENAME.test('fast-learning-2026-10-20T03-15-00-000Z.sql.gz'));
  for (const name of ['other.sql.gz', 'fast-learning-2026-10-20TabcZ.sql.gz', 'fast-learning-2026-10-20T03-15-00-000Z.sql.gz.partial']) assert.equal(BACKUP_FILENAME.test(name), false);
});
test('mysqldump child receives only system essentials, never service secrets or webhook URLs', () => {
  assert.deepEqual(backupChildEnv({ PATH: '/usr/bin', LANG: 'C.UTF-8', TZ: 'UTC', DB_PASSWORD: 'private-password', JWT_SECRET: 'private-secret', MYSQL_PWD: 'private-password', MONITOR_WEBHOOK_URL: 'https://hooks.example/private-token', SERVER_BRAIN_URL: 'https://ai.example/private-token' }), { PATH: '/usr/bin', LANG: 'C.UTF-8', TZ: 'UTC' });
});
test('MySQL credentials are option-file quoted without newline/section injection', () => {
  const contents = defaultsFile({ DB_USER: 'backup', DB_PASSWORD: 'secret"\\\n[client]\r' });
  assert.match(contents, /password="secret\\"\\\\\\n\[client\]\\r"/);
  assert.equal(contents.split('\n').filter(line => line === '[client]').length, 1);
  assert.throws(() => defaultsFile({ DB_PORT: '3306\npassword=x' }), /DB_PORT/);
});
test('retention removes only owned expired completed dumps after successful backup', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fl-retention-'));
  const expired = 'fast-learning-2026-01-01T00-00-00-000Z.sql.gz';
  const recent = 'fast-learning-2026-10-18T00-00-00-000Z.sql.gz';
  try {
    for (const filename of [expired, recent, 'other.sql.gz', `${expired}.partial`]) await fs.writeFile(path.join(directory, filename), 'test');
    await fs.utimes(path.join(directory, expired), new Date(0), new Date(0));
    await removeExpired(directory, 7);
    assert.deepEqual((await fs.readdir(directory)).sort(), [`${expired}.partial`, recent, 'other.sql.gz'].sort());
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
