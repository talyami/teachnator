'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createQuotaService, ownerFor } = require('./material_quota');
test('guest IP quota persistence failures are never swallowed', async () => {
  const db = { transaction: async work => work(async sql => {
    if (sql.includes('guest_ip_usage')) throw new Error('DB unavailable');
    if (sql.startsWith('INSERT IGNORE')) return {};
    if (sql.startsWith('SELECT * FROM material_quota_accounts')) return [{ material_limit: 1, materials_used: 0, pending_generation_id: null }];
    throw new Error('Unexpected SQL');
  }) };
  const owner = ownerFor(null, 'abcdefghijklmnop', '203.0.113.17');
  await assert.rejects(createQuotaService(db).read(owner), /DB unavailable/);
});
