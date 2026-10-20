'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { maintain, main } = require('./maintenance');
test('maintenance dry-run is read-only with shared bounded retention', async () => {
  const calls = [];
  const db = { query: async (sql, params) => { calls.push({ sql, params }); return [[{ count: 3 }]]; } };
  const result = await maintain(db, { dryRun: true, env: { TTS_CACHE_RETENTION_DAYS: '5' } });
  assert.equal(result.counts.tts_cache, 3);
  assert.equal(calls[0].params[0], 5);
  assert.ok(calls.every(call => call.sql.startsWith('SELECT')));
  await assert.rejects(maintain(db, { env: { TTS_CACHE_RETENTION_DAYS: '0' } }), /Invalid/);
});
test('maintenance prunes operational records only, never migrates or deletes accounts', async () => {
  const calls = [];
  await maintain({ query: async (sql, params) => { calls.push(sql); return [[{ count: 0 }]]; } }, { env: {} });
  const sql = calls.join('\n');
  assert.match(sql, /DELETE FROM tts_cache/);
  assert.match(sql, /SET state = 'expired'/);
  assert.doesNotMatch(sql, /CREATE|ALTER|INSERT|DELETE FROM users|DELETE FROM materials/);
});
test('maintenance closes its dedicated connection on failure', async () => {
  let ended = false;
  await assert.rejects(main({ env: {}, createPool: () => ({ query: async () => { throw new Error('private'); }, end: async () => { ended = true; } }) }));
  assert.equal(ended, true);
});
