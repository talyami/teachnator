'use strict';
const { createHash, randomUUID } = require('crypto');
const db = require('./db');
const RESERVATION_MS = 30 * 60 * 1000;
function fail(status, message) { return Object.assign(new Error(message), { status }); }
function ownerFor(user, guestDevice) {
  if (user?.id) return { key: `user:${user.id}`, userId: user.id, admin: user.role === 'admin' };
  if (typeof guestDevice !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(guestDevice)) {
    throw fail(400, 'A persistent X-Guest-Device identifier (16-128 URL-safe characters) is required.');
  }
  return { key: `guest:${createHash('sha256').update(guestDevice).digest('hex')}`, userId: null, admin: false };
}
function snapshot(account, owner, job) {
  const limit = owner.admin || account.material_limit === null ? null : Number(account.material_limit);
  const used = Number(account.materials_used);
  const reserved = job?.state === 'pending' && !Number(job.charged) ? 1 : 0;
  return { materialLimit: limit, materialsUsed: used, remaining: limit === null ? null : Math.max(0, limit - used - reserved), reserved, canGenerate: !job && (limit === null || used < limit), pendingGenerationId: job?.id || null, expiresAt: job ? new Date(job.expires_at).toISOString() : null };
}
function createQuotaService(database = db, now = Date.now) {
  async function locked(owner, work) {
    return database.transaction(async q => {
      await q('INSERT IGNORE INTO material_quota_accounts (owner_key) VALUES (?)', [owner.key]);
      const [account] = await q('SELECT * FROM material_quota_accounts WHERE owner_key = ? FOR UPDATE', [owner.key]);
      // Read admin status inside the transaction rather than trusting a stale JWT.
      if (owner.userId) {
        const [user] = await q('SELECT role FROM users WHERE id = ?', [owner.userId]);
        if (!user) throw fail(401, 'Account no longer exists.');
        owner = { ...owner, admin: user.role === 'admin' };
      }
      let job = null;
      if (account.pending_generation_id) {
        [job] = await q('SELECT * FROM material_generations WHERE id = ? FOR UPDATE', [account.pending_generation_id]);
        if (!job || job.state !== 'pending' || new Date(job.expires_at).getTime() <= now()) {
          if (job?.state === 'pending') await q("UPDATE material_generations SET state = 'expired' WHERE id = ?", [job.id]);
          await q('UPDATE material_quota_accounts SET pending_generation_id = NULL WHERE owner_key = ?', [owner.key]);
          account.pending_generation_id = null;
          job = null;
        }
      }
      return work(q, account, job, owner);
    });
  }
  async function findJob(q, owner, id) {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw fail(400, 'generationId is required.');
    const [job] = await q('SELECT * FROM material_generations WHERE id = ? AND owner_key = ? FOR UPDATE', [id, owner.key]);
    if (!job) throw fail(404, 'Generation not found.');
    return job;
  }
  const read = owner => locked(owner, (q, account, job, currentOwner) => snapshot(account, currentOwner, job));
  const start = owner => locked(owner, async (q, account, pending, currentOwner) => {
    if (pending) throw fail(409, 'A material generation is already pending.');
    const quota = snapshot(account, currentOwner, null);
    if (!quota.canGenerate) throw fail(403, 'Your lifetime material allowance is exhausted.');
    const id = randomUUID();
    const expires = new Date(now() + RESERVATION_MS);
    await q('INSERT INTO material_generations (id, owner_key, user_id, expires_at) VALUES (?, ?, ?, ?)', [id, owner.key, owner.userId, expires]);
    await q('UPDATE material_quota_accounts SET pending_generation_id = ? WHERE owner_key = ?', [id, owner.key]);
    return { success: true, generationId: id, quota: snapshot(account, currentOwner, { id, state: 'pending', charged: 0, expires_at: expires }) };
  });
  const claim = (owner, id, operation) => locked(owner, async (q, account, pending) => {
    if (!['draft', 'revise'].includes(operation)) throw fail(400, 'Use operation draft or revise.');
    const job = await findJob(q, owner, id);
    if (!pending || pending.id !== job.id || job.state !== 'pending') throw fail(409, 'Generation is not pending or has expired.');
    if (job.draft_state === 'running' || job.revise_state === 'running') throw fail(409, 'A generation operation is already running.');
    if (job[`${operation}_state`] !== 'idle') throw fail(409, 'This generation operation has already succeeded.');
    if (operation === 'revise' && job.draft_state !== 'done') throw fail(409, 'Complete the draft first.');
    await q(`UPDATE material_generations SET ${operation}_state = 'running' WHERE id = ?`, [id]);
  });
  // Charge on the FIRST successful generation call, not on the client completion
  // acknowledgement. Otherwise cancelling after receiving AI output bypasses quotas.
  const settle = (owner, id, operation, succeeded) => locked(owner, async (q, account, pending, currentOwner) => {
    if (!['draft', 'revise'].includes(operation)) throw fail(400, 'Invalid operation.');
    const job = await findJob(q, owner, id);
    if (job[`${operation}_state`] !== 'running') throw fail(409, 'Operation is not running.');
    await q(`UPDATE material_generations SET ${operation}_state = ? WHERE id = ?`, [succeeded ? 'done' : 'idle', id]);
    // Never deliver or charge late output after the reservation expired.
    if (!pending || pending.id !== id) return { active: false, quota: snapshot(account, currentOwner, pending) };
    if (succeeded && !Number(job.charged)) {
      await q('UPDATE material_quota_accounts SET materials_used = materials_used + 1 WHERE owner_key = ?', [owner.key]);
      await q('UPDATE material_generations SET charged = 1 WHERE id = ?', [id]);
      account.materials_used = Number(account.materials_used) + 1;
      job.charged = 1;
    }
    return { active: true, quota: snapshot(account, currentOwner, job) };
  });
  const cancel = (owner, id) => locked(owner, async (q, account, pending, currentOwner) => {
    const job = await findJob(q, owner, id);
    if (job.state === 'completed') throw fail(409, 'Completed generations cannot be cancelled.');
    if (job.draft_state === 'running' || job.revise_state === 'running') throw fail(409, 'Cannot cancel an in-flight operation.');
    if (job.state === 'pending') await q("UPDATE material_generations SET state = 'cancelled' WHERE id = ?", [id]);
    if (pending?.id === id) {
      await q('UPDATE material_quota_accounts SET pending_generation_id = NULL WHERE owner_key = ?', [owner.key]);
      pending = null;
    }
    return { success: true, quota: snapshot(account, currentOwner, pending) };
  });
  const complete = (owner, id, body) => locked(owner, async (q, account, pending, currentOwner) => {
    const job = await findJob(q, owner, id);
    if (job.state === 'completed') return { success: true, materialId: job.material_id, quota: snapshot(account, currentOwner, pending) };
    if (!pending || pending.id !== id || job.draft_state !== 'done' || job.revise_state === 'running' || !Number(job.charged)) throw fail(409, 'A successful, non-running draft is required before completion.');
    const { title, contentPreview = '', sourceFilename = '' } = body || {};
    let questions = body?.questions;
    if (typeof questions === 'string') { try { questions = JSON.parse(questions); } catch { throw fail(400, 'Invalid questions JSON.'); } }
    if (typeof title !== 'string' || !title.trim() || title.length > 255 || !Array.isArray(questions) || !questions.length || questions.some(question => !question || typeof question !== 'object' || Array.isArray(question)) || typeof contentPreview !== 'string' || typeof sourceFilename !== 'string' || sourceFilename.length > 255) throw fail(400, 'A title and nonempty questions array are required.');
    let materialId = null;
    if (owner.userId) {
      const result = await q('INSERT INTO materials (user_id, title, content_preview, source_filename, questions_json, total_questions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())', [owner.userId, title.trim(), contentPreview, sourceFilename, JSON.stringify(questions), questions.length]);
      materialId = result.insertId;
    }
    await q("UPDATE material_generations SET state = 'completed', material_id = ? WHERE id = ?", [materialId, id]);
    await q('UPDATE material_quota_accounts SET pending_generation_id = NULL WHERE owner_key = ?', [owner.key]);
    return { success: true, materialId, quota: snapshot(account, currentOwner, null) };
  });
  const authorizeExisting = async (owner, { materialId, generationId }) => {
    if (owner.userId) {
      if (!Number.isSafeInteger(Number(materialId)) || Number(materialId) < 1) throw fail(400, 'An owned materialId is required.');
      const rows = await database.query('SELECT id FROM materials WHERE id = ? AND user_id = ?', [Number(materialId), owner.userId]);
      if (!rows.length) throw fail(403, 'Material ownership is required.');
    } else {
      if (typeof generationId !== 'string') throw fail(400, 'A completed generationId is required.');
      const rows = await database.query("SELECT id FROM material_generations WHERE id = ? AND owner_key = ? AND state = 'completed'", [generationId, owner.key]);
      if (!rows.length) throw fail(403, 'A completed generation belonging to this device is required.');
    }
  };
  const setLimit = async (id, materialLimit) => {
    if (!Number.isSafeInteger(Number(id)) || Number(id) < 1 || (materialLimit !== null && (!Number.isSafeInteger(materialLimit) || materialLimit < 0 || materialLimit > 4294967295))) throw fail(400, 'materialLimit must be a nonnegative integer or null.');
    return locked({ key: `user:${Number(id)}`, userId: Number(id), admin: false }, async (q, account, pending, owner) => {
      await q('UPDATE material_quota_accounts SET material_limit = ? WHERE owner_key = ?', [materialLimit, owner.key]);
      account.material_limit = materialLimit;
      return { success: true, quota: snapshot(account, owner, pending) };
    });
  };
  return { read, start, claim, settle, cancel, complete, authorizeExisting, setLimit };
}
module.exports = { createQuotaService, ownerFor, RESERVATION_MS, ...createQuotaService() };
