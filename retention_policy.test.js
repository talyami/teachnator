'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getRetentionPolicy, getTtsCacheFilter } = require('./retention_policy');
test('retention defaults are shared and bounded without deleting current-day budgets', () => {
  assert.deepEqual(getRetentionPolicy({}), { ttsCacheDays: 7, aiUsageDays: 90, dailyBudgetDays: 7, backupDays: 7 });
  assert.equal(Object.isFrozen(getRetentionPolicy({})), true);
  for (const env of [{ TTS_CACHE_RETENTION_DAYS: '0' }, { AI_USAGE_RETENTION_DAYS: '366' }, { AI_DAILY_BUDGET_RETENTION_DAYS: '1' }, { BACKUP_RETENTION_DAYS: '2; DROP TABLE users' }, { BACKUP_RETENTION_DAYS: '91' }]) assert.throws(() => getRetentionPolicy(env), /Invalid/);
  assert.deepEqual(getTtsCacheFilter({ TTS_CACHE_RETENTION_DAYS: '14' }), { sql: 'created_at >= (UTC_TIMESTAMP() - INTERVAL ? DAY)', params: [14] });
});
