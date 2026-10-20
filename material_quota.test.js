'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const dbPath = require.resolve('./db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
const { createQuotaService, ownerFor } = require('./material_quota');
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

const { validateQuestions } = require('./quiz_generation');
const generationId = '12345678-1234-4234-8234-123456789abc';
const question = { id: 'planet', type: 'mcq', text: 'Closest planet?', options: ['Mercury', 'Venus'], correct: 0 };
function memoryDatabase() {
  const account = { material_limit: 1, materials_used: 0, pending_generation_id: generationId };
  const job = { id: generationId, owner_key: 'user:1', state: 'pending', draft_state: 'running', revise_state: 'idle', charged: 0, expires_at: new Date(1000000), canonical_questions_json: null, material_id: null };
  const materials = [], usage = [{ owner_key: 'user:1', generation_id: generationId, material_id: null }], calls = [];
  let failInsert = false;
  async function query(sql, params = []) {
    calls.push({ sql, params });
    if (sql.startsWith('INSERT IGNORE INTO material_quota_accounts')) return {};
    if (sql.startsWith('SELECT * FROM material_quota_accounts')) return [{ ...account }];
    if (sql.startsWith('SELECT role, status FROM users')) return [{ role: 'user', status: 'active' }];
    if (sql.startsWith('SELECT * FROM material_generations')) return !params[1] || params[1] === job.owner_key ? [{ ...job }] : [];
    if (sql.includes("SET state = 'expired'")) { job.state = 'expired'; return {}; }
    if (sql.includes('SET materials_used = materials_used + 1')) { account.materials_used++; return {}; }
    if (sql.includes('SET charged = 1')) { job.charged = 1; return {}; }
    if (sql.includes('canonical_questions_json = ?')) {
      job[/SET (draft|revise)_state/.exec(sql)[1] + '_state'] = 'done'; job.canonical_questions_json = params[0]; return {};
    }
    if (/SET (draft|revise)_state = 'running'/.test(sql)) { job[/SET (draft|revise)_state/.exec(sql)[1] + '_state'] = 'running'; return {}; }
    if (/SET (draft|revise)_state = 'idle'/.test(sql)) { job[/SET (draft|revise)_state/.exec(sql)[1] + '_state'] = 'idle'; return {}; }
    if (sql.includes("SET state = 'completed'")) { job.state = 'completed'; job.material_id = params[0]; return {}; }
    if (sql.includes('SET pending_generation_id = NULL')) { account.pending_generation_id = null; return {}; }
    if (sql.startsWith('INSERT INTO materials')) {
      if (failInsert) throw new Error('Material insert failed');
      materials.push({ id: 42, questions: JSON.parse(params[4]) }); return { insertId: 42 };
    }
    if (sql.startsWith('UPDATE ai_usage')) { usage[0].material_id = params[0]; return {}; }
    if (sql.startsWith('SELECT id FROM materials')) return params[1] === 1 && params[0] === 42 ? [{ id: 42 }] : [];
    if (sql.startsWith('SELECT id, material_id FROM material_generations')) return params[1] === job.owner_key && (job.state === 'completed' || job.charged) ? [{ id: job.id, material_id: job.material_id }] : [];
    throw new Error('Unhandled SQL: ' + sql);
  }
  return { query, transaction: async work => work(query), account, job, materials, usage, calls,
    failInsert(value) { failInsert = value; } };
}
const owner = { key: 'user:1', userId: 1, admin: false };
test('successful settlement stores canonical bank and completion ignores forged browser questions', async () => {
  const db = memoryDatabase(), service = createQuotaService(db, () => 0);
  const result = await service.settle(owner, generationId, 'draft', true, [question]);
  assert.equal(result.active, true); assert.equal(db.account.materials_used, 1);
  assert.deepEqual(JSON.parse(db.job.canonical_questions_json), validateQuestions([question]));
  await service.settle(owner, generationId, 'draft', true, [question]);
  assert.equal(db.account.materials_used, 1);
  await assert.rejects(service.settle(owner, generationId, 'draft', true, [{ ...question, text: 'different' }]), { status: 409 });
  const complete = await service.complete(owner, generationId, { title: 'Planets', questions: 'not even JSON' });
  assert.equal(complete.materialId, 42);
  assert.deepEqual(db.materials[0].questions, validateQuestions([question]));
  assert.equal(db.usage[0].material_id, 42);
  const again = await service.complete(owner, generationId, { title: null, questions: [] });
  assert.equal(again.materialId, 42); assert.equal(db.materials.length, 1);
});
test('revision loads stored canonical bank, failed revision retains draft and does not re-charge', async () => {
  const db = memoryDatabase(), service = createQuotaService(db, () => 0);
  await service.settle(owner, generationId, 'draft', true, [question]);
  const claimed = await service.claim(owner, generationId, 'revise');
  assert.deepEqual(claimed.questions, validateQuestions([question]));
  await service.settle(owner, generationId, 'revise', false);
  assert.deepEqual(JSON.parse(db.job.canonical_questions_json), validateQuestions([question]));
  assert.equal(db.job.revise_state, 'idle'); assert.equal(db.account.materials_used, 1);
  await service.complete(owner, generationId, { title: 'Draft retained', questions: [] });
  assert.equal(db.materials.length, 1);
});
test('successful revision replaces canonical bank without charging again', async () => {
  const db = memoryDatabase(), service = createQuotaService(db, () => 0);
  await service.settle(owner, generationId, 'draft', true, [question]);
  await service.claim(owner, generationId, 'revise');
  const revised = { ...question, text: 'Which planet is closest to the sun?' };
  await service.settle(owner, generationId, 'revise', true, [revised]);
  await service.complete(owner, generationId, { title: 'Revised', questions: [question] });
  assert.equal(db.materials[0].questions[0].text, revised.text);
  assert.equal(db.account.materials_used, 1);
});
test('missing canonical banks and expired outputs fail closed without trusting browser content', async () => {
  const db = memoryDatabase(), service = createQuotaService(db, () => 0);
  db.job.draft_state = 'done'; db.job.charged = 1;
  await assert.rejects(service.complete(owner, generationId, { title: 'Forged', questions: [question] }), { status: 409 });
  await assert.rejects(service.claim(owner, generationId, 'revise'), { status: 409 });
  db.job.draft_state = 'running'; db.job.expires_at = new Date(-1); db.job.charged = 0;
  const result = await service.settle(owner, generationId, 'draft', true, [question]);
  assert.equal(result.active, false); assert.equal(db.job.canonical_questions_json, null);
  assert.equal(db.account.materials_used, 0); assert.equal(db.job.state, 'expired');
});
test('completion can retry a material-save failure without losing canonical draft', async () => {
  const db = memoryDatabase(), service = createQuotaService(db, () => 0);
  await service.settle(owner, generationId, 'draft', true, [question]);
  db.failInsert(true);
  await assert.rejects(service.complete(owner, generationId, { title: 'Retry' }), /Material insert failed/);
  assert.equal(db.job.state, 'pending'); assert.ok(db.job.canonical_questions_json);
  db.failInsert(false);
  assert.equal((await service.complete(owner, generationId, { title: 'Retry' })).materialId, 42);
});
test('authorization returns only verified attribution, including for administrators', async () => {
  const db = memoryDatabase(), service = createQuotaService(db, () => 0);
  db.job.charged = 1; db.job.material_id = 42;
  assert.deepEqual(await service.authorizeExisting(owner, { generationId }), { materialId: 42, generationId });
  assert.deepEqual(await service.authorizeExisting(owner, { materialId: 42, generationId: 'forged' }), { materialId: 42, generationId: null });
  await assert.rejects(service.authorizeExisting({ key: 'user:2', userId: 2, admin: true }, { materialId: 42 }), { status: 403 });
});

const { validateProgress } = require('./progress_validation');
test('progress validates revisions and finite bounded timer values before serialization', () => {
  const base = { materialId: 42, mode: 'quiz', totalQuestions: 1, saveRevision: 0, state: { timeLeft: 900, timerActive: true } };
  assert.equal(validateProgress(base).saveRevision, 0);
  for (const saveRevision of [undefined, null, -1, 1.1, '2', Number.MAX_SAFE_INTEGER + 1, Infinity]) {
    assert.throws(() => validateProgress({ ...base, saveRevision }), { status: 400 });
  }
  for (const timeLeft of [null, '900', -1, 86401, NaN, Infinity]) {
    assert.throws(() => validateProgress({ ...base, state: { timeLeft } }), { status: 400 });
  }
  assert.throws(() => validateProgress({ ...base, state: { nested: { score: Infinity } } }), { status: 400 });
  assert.equal(validateProgress({ ...base, state: JSON.stringify({ timeLeft: 0 }) }).stateJson, '{"timeLeft":0}');
});
