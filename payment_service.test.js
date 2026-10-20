'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPaymentService } = require('./payment_service');
const orderId = '11111111-1111-4111-8111-111111111111';
const env = { PAYMENT_ENABLED: 'true', PAYMENT_PROVIDER: 'moyasar', MOYASAR_SECRET_KEY: 'sk_test_secret',
  MOYASAR_PUBLISHABLE_KEY: 'pk_test_public', PAYMENT_WEBHOOK_SECRET: 'a-test-webhook-secret-long-enough',
  CREDIT_PACKS_JSON: JSON.stringify([{ id: 'approved', materials: 5, amountHalalas: 1234, currency: 'SAR' }]) };
const event = { id: 'event-1', type: 'payment_paid', data: { id: 'payment-1', status: 'paid', metadata: { orderId } } };
function harness({ failOrderUpdate = false, paymentOverride = {} } = {}) {
  let state = { limit: 1, order: { id: orderId, user_id: 3, pack_id: 'approved', materials_added: 5,
    amount_halalas: 1234, currency: 'SAR', provider: 'moyasar', status: 'pending', provider_payment_id: null } };
  let calls = [], providerCalls = 0, commits = 0, rollbacks = 0;
  async function q(sql, params) {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT * FROM payment_orders')) return [state.order];
    if (sql.startsWith('SELECT id FROM payment_orders')) return [];
    if (sql.startsWith('SELECT id FROM users')) return [{ id: 3 }];
    if (sql.startsWith('SELECT * FROM material_quota_accounts')) return [{ material_limit: state.limit }];
    if (sql.startsWith('UPDATE material_quota_accounts')) { state.limit = params[0]; return {}; }
    if (sql.startsWith('UPDATE payment_orders')) {
      if (failOrderUpdate) throw new Error('Simulated DB failure');
      state.order.status = 'paid'; state.order.provider_payment_id = params[0]; return {};
    }
    if (sql.startsWith('INSERT IGNORE')) return {};
    throw new Error('Unexpected SQL: ' + sql);
  }
  const service = createPaymentService({ query: q, transaction: async work => {
    const before = structuredClone(state);
    try { const result = await work(q); commits++; return result; } catch (e) { state = before; rollbacks++; throw e; }
  } }, env, async (url, options) => {
    providerCalls++;
    assert.equal(url, 'https://api.moyasar.com/v1/payments/payment-1');
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    assert.equal(options.headers.Authorization, 'Basic ' + Buffer.from('sk_test_secret:').toString('base64'));
    return { ok: true, json: async () => ({ id: 'payment-1', status: 'paid', amount: 1234, currency: 'SAR',
      metadata: { orderId, userId: '3', packId: 'approved' }, ...paymentOverride }) };
  });
  return { service, get state() { return state; }, calls, stats: () => ({ commits, rollbacks, providerCalls }) };
}
test('payments require explicit enablement and all configured prices/credentials', async () => {
  for (const values of [{}, { ...env, PAYMENT_ENABLED: 'false' }, { ...env, CREDIT_PACKS_JSON: '[]' }, { ...env, PAYMENT_WEBHOOK_SECRET: '' }, { ...env, MOYASAR_PUBLISHABLE_KEY: 'pk_live_wrongmode' }]) {
    const service = createPaymentService({}, values);
    assert.equal(service.enabled(), false);
    await assert.rejects(service.checkout({ id: 3 }, 'approved'), { status: 503 });
    await assert.rejects(service.webhook(event, env.PAYMENT_WEBHOOK_SECRET), { status: 503 });
  }
});
test('webhook requires identity/status and does not trust callback payload as proof', async () => {
  const h = harness();
  await assert.rejects(h.service.webhook(event, 'wrong-secret'), { status: 401 });
  await assert.rejects(h.service.webhook({ ...event, id: undefined }, env.PAYMENT_WEBHOOK_SECRET), { status: 400 });
  await assert.rejects(h.service.webhook({ ...event, data: { id: 'payment-1' } }, env.PAYMENT_WEBHOOK_SECRET), { status: 400 });
  assert.equal(h.stats().providerCalls, 0);
  const unpaid = harness({ paymentOverride: { status: 'initiated' } });
  await assert.rejects(unpaid.service.webhook(event, env.PAYMENT_WEBHOOK_SECRET), { status: 400 });
  assert.equal(unpaid.state.limit, 1);
});
test('verified payment grants credits once with paid state in same transaction', async () => {
  const h = harness();
  assert.equal((await h.service.webhook(event, env.PAYMENT_WEBHOOK_SECRET)).alreadyPaid, false);
  assert.equal(h.state.limit, 6); assert.equal(h.state.order.status, 'paid');
  assert.equal((await h.service.webhook(event, env.PAYMENT_WEBHOOK_SECRET)).alreadyPaid, true);
  assert.equal(h.state.limit, 6); assert.equal(h.stats().providerCalls, 2);
  assert.equal(h.calls.filter(c => c.sql.startsWith('UPDATE material_quota_accounts')).length, 1);
});
test('failed paid update rolls back credit grant atomically', async () => {
  const h = harness({ failOrderUpdate: true });
  await assert.rejects(h.service.webhook(event, env.PAYMENT_WEBHOOK_SECRET), /Simulated DB failure/);
  assert.equal(h.state.limit, 1); assert.equal(h.state.order.status, 'pending');
  assert.equal(h.stats().rollbacks, 1); assert.equal(h.stats().commits, 0);
});
test('exact amount, currency, provider payment ID and all metadata must match', async () => {
  for (const paymentOverride of [{ amount: 1235 }, { currency: 'USD' }, { id: 'other' },
    { metadata: { orderId, userId: '99', packId: 'approved' } }, { metadata: { orderId, userId: '3', packId: 'wrong' } }]) {
    const h = harness({ paymentOverride });
    await assert.rejects(h.service.webhook(event, env.PAYMENT_WEBHOOK_SECRET), { status: 400 });
    assert.equal(h.state.limit, 1); assert.equal(h.state.order.status, 'pending');
  }
});
