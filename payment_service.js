'use strict';
const { randomUUID, timingSafeEqual } = require('crypto');
const fail = (status, message) => Object.assign(new Error(message), { status });

// Disabled scaffold, not a production payment integration. Prices require operator approval.
function createPaymentService(database, env = process.env, fetchProvider = (...args) => fetch(...args)) {
  function packs() {
    let configured;
    try { configured = JSON.parse(env.CREDIT_PACKS_JSON || '[]'); } catch { return []; }
    if (!Array.isArray(configured) || configured.length > 20) return [];
    const seen = new Set();
    return configured.filter(p => p && /^[a-z0-9_-]{1,32}$/.test(p.id) && !seen.has(p.id) &&
      Number.isSafeInteger(p.materials) && p.materials > 0 && p.materials <= 100000 &&
      Number.isSafeInteger(p.amountHalalas) && p.amountHalalas > 0 && p.amountHalalas <= 100000000 &&
      p.currency === 'SAR' && seen.add(p.id)).map(p => ({
      id: p.id, materials: p.materials, amountHalalas: p.amountHalalas,
      priceSar: p.amountHalalas / 100, currency: 'SAR',
      titleAr: String(p.titleAr || p.id).slice(0, 255), titleEn: String(p.titleEn || p.id).slice(0, 255)
    }));
  }
  const enabled = () => env.PAYMENT_ENABLED === 'true' && env.PAYMENT_PROVIDER === 'moyasar' &&
    /^sk_(test|live)_\S+$/.test(env.MOYASAR_SECRET_KEY || '') &&
    /^pk_(test|live)_\S+$/.test(env.MOYASAR_PUBLISHABLE_KEY || '') &&
    env.MOYASAR_SECRET_KEY.split('_')[1] === env.MOYASAR_PUBLISHABLE_KEY.split('_')[1] &&
    typeof env.PAYMENT_WEBHOOK_SECRET === 'string' && env.PAYMENT_WEBHOOK_SECRET.length >= 24 && packs().length > 0;
  function requireEnabled() {
    if (!enabled()) throw fail(503, 'Payments are disabled or not fully configured.');
  }
  async function checkout(user, packId) {
    requireEnabled();
    const pack = packs().find(p => p.id === packId);
    if (!pack) throw fail(400, 'Invalid credit pack.');
    const orderId = randomUUID();
    await database.query(`INSERT INTO payment_orders (id, user_id, pack_id, materials_added, amount_halalas, currency, provider, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'moyasar', 'pending', NOW())`,
    [orderId, user.id, pack.id, pack.materials, pack.amountHalalas, pack.currency]);
    return { success: true, orderId, pack, metadata: { orderId, userId: String(user.id), packId: pack.id }, moyasarPublishableKey: env.MOYASAR_PUBLISHABLE_KEY };
  }
  async function webhook(body, secret) {
    requireEnabled();
    const a = Buffer.from(typeof secret === 'string' ? secret : '');
    const b = Buffer.from(env.PAYMENT_WEBHOOK_SECRET);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw fail(401, 'Invalid webhook authentication.');
    // Accept the documented event envelope only. Never infer paid from missing status.
    if (!body || typeof body.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.id) ||
        typeof body.type !== 'string' || !body.data || typeof body.data.id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(body.data.id) || typeof body.data.status !== 'string') {
      throw fail(400, 'Payment event identity and status are required.');
    }
    if (body.type !== 'payment_paid' || body.data.status !== 'paid') return { success: true, ignored: true };
    let payment;
    try {
      const response = await fetchProvider(`https://api.moyasar.com/v1/payments/${encodeURIComponent(body.data.id)}`, {
        headers: { Authorization: 'Basic ' + Buffer.from(env.MOYASAR_SECRET_KEY + ':').toString('base64') },
        signal: AbortSignal.timeout(8000), redirect: 'error'
      });
      if (!response.ok) throw new Error('Provider verification failed');
      payment = await response.json();
    } catch { throw fail(502, 'Unable to verify payment with provider.'); }
    const orderId = payment?.metadata?.orderId;
    if (payment?.id !== body.data.id || payment.status !== 'paid' ||
        typeof orderId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      throw fail(400, 'Provider payment verification mismatch.');
    }
    return database.transaction(async q => {
      const [order] = await q('SELECT * FROM payment_orders WHERE id = ? FOR UPDATE', [orderId]);
      if (!order) throw fail(404, 'Order not found.');
      if (order.provider !== 'moyasar' || payment.amount !== Number(order.amount_halalas) || payment.currency !== order.currency ||
          payment.metadata.userId !== String(order.user_id) || payment.metadata.packId !== order.pack_id ||
          (body.data.metadata?.orderId && body.data.metadata.orderId !== orderId)) throw fail(400, 'Order payment mismatch.');
      if (order.status === 'paid') {
        if (order.provider_payment_id !== payment.id) throw fail(409, 'Order already has another payment.');
        return { success: true, orderId, alreadyPaid: true };
      }
      if (order.status !== 'pending') throw fail(409, 'Order is not pending.');
      const [duplicate] = await q('SELECT id FROM payment_orders WHERE provider = ? AND provider_payment_id = ? FOR UPDATE', ['moyasar', payment.id]);
      if (duplicate) throw fail(409, 'Payment already assigned.');
      const [user] = await q('SELECT id FROM users WHERE id = ? FOR UPDATE', [order.user_id]);
      if (!user) throw fail(404, 'Account no longer exists.');
      const count = Number(order.materials_added);
      if (!Number.isSafeInteger(count) || count < 1 || count > 100000) throw fail(400, 'Invalid order credits.');
      const key = `user:${order.user_id}`;
      await q('INSERT IGNORE INTO material_quota_accounts (owner_key) VALUES (?)', [key]);
      const [account] = await q('SELECT * FROM material_quota_accounts WHERE owner_key = ? FOR UPDATE', [key]);
      if (!account) throw fail(503, 'Quota account unavailable.');
      if (account.material_limit !== null) {
        const next = Number(account.material_limit) + count;
        if (!Number.isSafeInteger(next) || next > 4294967295) throw fail(409, 'Credit balance limit exceeded.');
        await q('UPDATE material_quota_accounts SET material_limit = ? WHERE owner_key = ?', [next, key]);
      }
      // Both changes commit or roll back together; unique provider/payment index is mandatory.
      await q("UPDATE payment_orders SET status = 'paid', provider_payment_id = ?, paid_at = NOW() WHERE id = ?", [payment.id, orderId]);
      return { success: true, orderId, alreadyPaid: false };
    });
  }
  return { packs, enabled, checkout, webhook };
}
module.exports = { createPaymentService };
