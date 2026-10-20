'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runMigrations, migrations, ensureColumn, ensureIndex } = require('./migrations');
function mockPool({ acquired = 1, applied = migrations.map(m => ({ version: m.version })), fail = false } = {}) {
  const calls = [];
  const connection = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT DATABASE()')) return [[{ name: 'test_db' }]];
      if (sql.includes('GET_LOCK')) return [[{ acquired }]];
      if (sql.startsWith('SELECT version')) return [applied];
      if (sql.includes('INFORMATION_SCHEMA.COLUMNS') || sql.includes('INFORMATION_SCHEMA.STATISTICS')) return [[]];
      if (fail && sql.startsWith('ALTER TABLE')) throw new Error('DDL failed');
      return [[]];
    },
    release() { calls.push({ sql: 'release' }); },
    destroy() { calls.push({ sql: 'destroy' }); }
  };
  return { calls, async getConnection() { return connection; } };
}
test('migrations skip applied versions and release connection-scoped lock', async () => {
  const pool = mockPool();
  await runMigrations(pool);
  assert.equal(pool.calls.filter(call => call.sql.startsWith('INSERT INTO schema_migrations')).length, 0);
  assert.ok(pool.calls.some(call => call.sql.includes('RELEASE_LOCK')));
  assert.equal(pool.calls.at(-1).sql, 'release');
});
test('migrations fail closed if advisory lock is unavailable', async () => {
  const pool = mockPool({ acquired: 0 });
  await assert.rejects(runMigrations(pool), /advisory lock/);
  assert.equal(pool.calls.some(call => call.sql.startsWith('CREATE TABLE')), false);
  assert.equal(pool.calls.at(-1).sql, 'release');
});
test('failed DDL is not marked applied and advisory lock is released', async () => {
  const pool = mockPool({ applied: [{ version: '001' }], fail: true });
  await assert.rejects(runMigrations(pool), /DDL failed/);
  assert.equal(pool.calls.some(call => call.sql.startsWith('INSERT INTO schema_migrations')), false);
  assert.ok(pool.calls.some(call => call.sql.includes('RELEASE_LOCK')));
});
test('pending compatibility migrations add session version, source binding, daily budgets', async () => {
  const pool = mockPool({ applied: [{ version: '001' }] });
  await runMigrations(pool, { logger: { info() {} } });
  const sql = pool.calls.map(call => call.sql).join('\n');
  assert.match(sql, /session_version/);
  assert.match(sql, /source_hash/);
  assert.match(sql, /ai_daily_budgets/);
  for (const name of ['canonical_questions_json', 'material_id', 'generation_id', 'idx_usage_material', 'idx_usage_generation', 'save_revision']) assert.ok(sql.includes(name));
  assert.equal(pool.calls.filter(call => call.sql.startsWith('INSERT INTO schema_migrations')).length, 4);
});
test('column and index helpers are retry-safe after partially committed MySQL DDL', async () => {
  const columns = new Set(), indexes = new Set(), alters = [];
  const connection = { async query(sql, params) {
    if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return [columns.has(params[1]) ? [{ COLUMN_NAME: params[1] }] : []];
    if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) return [indexes.has(params[1]) ? [{ INDEX_NAME: params[1] }] : []];
    if (sql.startsWith('ALTER TABLE')) {
      alters.push(sql);
      const column = sql.match(/ADD COLUMN `([^`]+)`/), index = sql.match(/ADD INDEX `([^`]+)`/);
      if (column) columns.add(column[1]); if (index) indexes.add(index[1]);
      return [[]];
    }
    throw new Error('Unexpected SQL');
  } };
  for (let attempt = 0; attempt < 2; attempt++) {
    await migrations.find(m => m.version === '004').up(connection);
    await migrations.find(m => m.version === '005').up(connection);
  }
  assert.equal(alters.length, 6);
  assert.equal(columns.size, 4); assert.equal(indexes.size, 2);
  await ensureColumn(connection, 'ai_usage', 'material_id', 'INT NULL');
  await ensureIndex(connection, 'ai_usage', 'idx_usage_material', ['material_id', 'created_at']);
  assert.equal(alters.length, 6);
});
