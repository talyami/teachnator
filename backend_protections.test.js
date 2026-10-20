'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'backend-tests-only-secret';
process.env.PAYMENT_ENABLED = 'false';
const dbPath = require.resolve('./db');
const aiPath = require.resolve('./ai_proxy');
let queries = [], owned = true, transactions = 0, aiCalls = 0, initialized = 0;
const progressRevisions = new Map();
async function query(sql, params = []) {
  queries.push({ sql, params });
  if (sql.startsWith('SELECT save_revision')) {
    const revision = progressRevisions.get(params.join(':'));
    return revision === undefined ? [] : [{ save_revision: revision }];
  }
  if (sql.includes('INSERT INTO user_progress')) {
    progressRevisions.set(params.slice(0, 3).join(':'), params.at(-1));
  }
  if (sql.startsWith('UPDATE user_progress SET current_index = 0')) {
    for (const [key, revision] of progressRevisions) {
      if (key.startsWith(params.slice(0, 2).join(':') + ':') && (params.length === 2 || key.endsWith(':' + params[2]))) progressRevisions.set(key, revision + 1);
    }
  }
  if (sql.startsWith('SELECT id') && sql.includes('FROM materials')) return owned ? [{ id: 7, total_questions: 3 }] : [];
  if (sql.startsWith('SELECT')) return [];
  return { affectedRows: 1 };
}
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  query, transaction: async work => { transactions++; return work(query); }, initDb: async () => { initialized++; return true; },
  isDbConnected: () => true, getAppVersion: async () => ({}), setAppVersion: async () => ({})
} };
require.cache[aiPath] = { id: aiPath, filename: aiPath, loaded: true, exports: {
  handleAiGenerate: async () => { aiCalls++; return { success: true }; }, SETTINGS_KEYS: [],
  maskSettingsForAdmin: x => x, mergeAdminSettingsUpdate: (a, b) => b
} };
const auth = require('./auth');
auth.authenticateToken = (req, res, next) => {
  req.user = req.headers.authorization === 'Bearer user' ? { id: 2, role: 'user' }
    : req.headers.authorization === 'Bearer admin' ? { id: 1, role: 'admin' } : null;
  next();
};
const { app } = require('./server');

async function withServer(work) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, body, token, method = 'POST') => {
    const response = await fetch(base + route, {
      method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    assert.match(response.headers.get('content-type'), /application\/json/);
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  try { await work(request); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('provider-funded routes reject guests before AI or database work', async () => withServer(async request => {
  queries = []; aiCalls = 0;
  for (const body of [{ operation: 'draft' }, { operation: 'revise' }, { operation: 'evaluate' }, { purpose: 'tts' }]) {
    assert.equal((await request('/api/ai/generate', body)).status, 401);
  }
  assert.equal((await request('/api/material-generations/start', {})).status, 401);
  assert.equal((await request('/teachnator/api/material-generations/start', {})).status, 401);
  assert.equal(aiCalls, 0); assert.equal(queries.length, 0);
}));

test('billing is explicitly disabled with no provider calls or SQL', async () => withServer(async request => {
  queries = [];
  assert.equal((await request('/api/billing/checkout', { packId: 'starter' }, 'user')).status, 503);
  assert.equal((await request('/api/billing/webhook', { status: 'paid' })).status, 503);
  const packs = await request('/api/billing/packs', undefined, undefined, 'GET');
  assert.equal(packs.data.paymentEnabled, false); assert.deepEqual(packs.data.packs, []);
  assert.equal(queries.length, 0);
}));

test('admin boundary, ownership and progress validation reject before writes', async () => withServer(async request => {
  queries = []; owned = false;
  assert.equal((await request('/api/admin/users/3', undefined, 'user', 'DELETE')).status, 403);
  const body = { materialId: 7, mode: 'quiz', expectedRevision: 0, currentIndex: 1, totalQuestions: 3, state: { currentIndex: 1 } };
  assert.equal((await request('/api/progress', body, 'user')).status, 404);
  assert.equal((await request('/api/progress', body, 'admin')).status, 404, 'admin cannot save progress to unowned material');
  assert.equal((await request('/api/progress', { ...body, currentIndex: -1 }, 'user')).status, 400);
  assert.equal((await request('/api/progress', { ...body, materialId: '7garbage' }, 'user')).status, 400);
  assert.equal((await request('/api/progress', { ...body, mode: 'anything' }, 'user')).status, 400);
  assert.equal((await request('/api/progress', { ...body, state: [] }, 'user')).status, 400);
  assert.equal(queries.filter(q => /^(INSERT|UPDATE|DELETE)\b/.test(q.sql)).length, 0);
}));

test('progress supports bounded large snapshots and preserves every mode', async () => withServer(async request => {
  queries = []; owned = true; progressRevisions.clear();
  const state = { shuffledQuestions: [{ text: 'a'.repeat(300000) }] };
  assert.equal((await request('/api/progress', { materialId: 7, mode: 'quiz', expectedRevision: 0, totalQuestions: 3, state }, 'user')).status, 200);
  assert.equal((await request('/api/progress', { materialId: 7, mode: 'learn', expectedRevision: 0, totalQuestions: 3, state }, 'user')).status, 200);
  assert.equal(queries.filter(q => q.sql.includes('INSERT INTO user_progress')).length, 2);
  assert.equal(queries.filter(q => q.sql.includes('DELETE FROM user_progress')).length, 0);
  assert.equal((await request('/api/progress', { materialId: 7, totalQuestions: 3, state: { value: 'a'.repeat(2200000) } }, 'user')).status, 413);
}));

test('stale progress cannot overwrite a newer checkpoint and modes have separate revisions', async () => withServer(async request => {
  queries = []; owned = true; progressRevisions.clear();
  const snapshot = { materialId: 7, mode: 'quiz', expectedRevision: 0, totalQuestions: 3, currentIndex: 1, state: { timeLeft: 30 } };
  const first = await request('/api/progress', snapshot, 'user');
  assert.equal(first.status, 200); assert.equal(first.data.revision, 1);
  const writes = () => queries.filter(q => q.sql.includes('INSERT INTO user_progress')).length;
  assert.equal((await request('/api/progress', { ...snapshot, currentIndex: 0 }, 'user')).status, 409);
  assert.equal(writes(), 1, 'stale snapshot must not write');
  const latest = await request('/api/progress', { ...snapshot, expectedRevision: 1, currentIndex: 3, isCompleted: true }, 'user');
  assert.equal(latest.status, 200); assert.equal(latest.data.revision, 2);
  const learn = await request('/api/progress', { ...snapshot, mode: 'learn' }, 'user');
  assert.equal(learn.status, 200); assert.equal(learn.data.revision, 1);
  assert.equal((await request('/api/progress', { ...snapshot, expectedRevision: -1 }, 'user')).status, 400);
  assert.equal((await request('/api/progress', { ...snapshot, state: { timeLeft: -5 } }, 'user')).status, 400);
}));

test('reset keeps a revision tombstone so old tabs cannot resurrect progress', async () => withServer(async request => {
  queries = []; owned = true; progressRevisions.clear();
  const snapshot = { materialId: 7, mode: 'quiz', expectedRevision: 0, totalQuestions: 3 };
  assert.equal((await request('/api/progress', snapshot, 'user')).status, 200);
  assert.equal((await request('/api/progress/7?mode=quiz', undefined, 'user', 'DELETE')).status, 200);
  assert.equal((await request('/api/progress', { ...snapshot, expectedRevision: 1 }, 'user')).status, 409);
  assert.equal(queries.filter(q => q.sql.startsWith('DELETE FROM user_progress')).length, 0);
}));

test('invalid Google startup configuration fails before DB initialization or listening', async () => {
  const previous = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  const before = initialized;
  try {
    await assert.rejects(require('./server').startServer(), /GOOGLE_CLIENT_ID/);
    assert.equal(initialized, before, 'invalid auth config must fail before database startup');
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = previous;
  }
});

test('admin deletion explicitly cascades in one transaction', async () => withServer(async request => {
  queries = []; transactions = 0;
  assert.equal((await request('/api/admin/users/2', undefined, 'admin', 'DELETE')).status, 200);
  assert.equal(transactions, 1);
  for (const table of ['user_progress', 'ai_usage', 'material_generations', 'material_quota_accounts', 'payment_orders', 'materials', 'users']) {
    assert.ok(queries.some(q => q.sql.startsWith(`DELETE FROM ${table} WHERE`)), table);
  }
  assert.ok(queries.at(-1).sql.startsWith('DELETE FROM users'));
}));

test('cross-site mutation is rejected before SQL or AI', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  queries = []; aiCalls = 0;
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ai/generate`, {
      method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json', Authorization: 'Bearer user' },
      body: JSON.stringify({ operation: 'draft' })
    });
    assert.equal(response.status, 403); assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(aiCalls, 0); assert.equal(queries.length, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('health, readiness, CSP and explicit CORS are available without auth', async () => withServer(async request => {
  const health = await request('/api/health', undefined, undefined, 'GET');
  assert.equal(health.status, 200);
  assert.ok(!health.headers.get('content-security-policy').includes('unsafe-eval'));
  assert.ok(!health.headers.get('content-security-policy').includes('unpkg.com'));
  assert.equal((await request('/api/ready', undefined, undefined, 'GET')).status, 200);
}));
