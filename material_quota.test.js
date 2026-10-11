'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createQuotaService, ownerFor, RESERVATION_MS } = require('./material_quota');
test('guest IDs must be persistent URL-safe identifiers and are hashed', () => {
  assert.throws(() => ownerFor(null), { status: 400 });
  assert.throws(() => ownerFor(null, 'short'), { status: 400 });
  const device = 'abcdefghijklmnop';
  const guest = ownerFor(null, device);
  assert.equal(guest.key, ownerFor(null, device).key);
  assert.ok(!guest.key.includes(device));
  assert.notEqual(guest.key, ownerFor(null, 'abcdefghijklmnop2').key);
  assert.equal(ownerFor({ id: 1, role: 'user' }, device).key, 'user:1');
});
