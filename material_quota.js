'use strict';
const { createHash, createHmac, timingSafeEqual, randomUUID } = require('crypto');
const db = require('./db');
const { validateQuestions } = require('./quiz_generation');

function storedQuestions(job) {
  try {
    const value = typeof job?.canonical_questions_json === 'string' ? JSON.parse(job.canonical_questions_json) : job?.canonical_questions_json;
    return validateQuestions(value);
  } catch (_) { throw fail(409, 'A server-validated question bank is required. Start a new generation if this reservation predates the upgrade.'); }
}

const RESERVATION_MS = 30 * 60 * 1000;

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function hashValue(prefix, value) {
  return createHash('sha256').update(`${prefix}:${value}`).digest('hex');
}

function signGuestDevice(deviceId, secret = process.env.JWT_SECRET) {
  if (!secret) return null;
  if (typeof deviceId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(deviceId)) return null;
  const sig = createHmac('sha256', secret).update(deviceId).digest('base64url');
  return `${deviceId}.${sig}`;
}

function verifyGuestDevice(token, secret = process.env.JWT_SECRET) {
  if (!secret) return null;
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const deviceId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(deviceId) || !sig) return null;
  const expected = createHmac('sha256', secret).update(deviceId).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return deviceId;
}

function ownerFor(user, guestDevice, clientIp = null) {
  if (user?.id) {
    return { key: `user:${user.id}`, userId: user.id, admin: user.role === 'admin' };
  }
  if (typeof guestDevice !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(guestDevice)) {
    throw fail(400, 'A persistent X-Guest-Device identifier (16-128 URL-safe characters) is required.');
  }
  const key = `guest:${createHash('sha256').update(guestDevice).digest('hex')}`;
  const normalizedIp = typeof clientIp === 'string' ? clientIp.trim() : '';
  const ipHash = normalizedIp && normalizedIp !== '127.0.0.1' && normalizedIp !== '::1' && normalizedIp !== '::ffff:127.0.0.1'
    ? hashValue('guest-ip', normalizedIp)
    : null;
  return ipHash
    ? { key, userId: null, admin: false, ipHash }
    : { key, userId: null, admin: false };
}

function snapshot(account, owner, job) {
  const limit = owner.admin || account.material_limit === null ? null : Number(account.material_limit);
  const used = Number(account.materials_used);
  const reserved = job?.state === 'pending' && !Number(job.charged) ? 1 : 0;
  return {
    materialLimit: limit,
    materialsUsed: used,
    remaining: limit === null ? null : Math.max(0, limit - used - reserved),
    reserved,
    canGenerate: !job && (limit === null || used < limit),
    pendingGenerationId: job?.id || null,
    expiresAt: job ? new Date(job.expires_at).toISOString() : null
  };
}

function createQuotaService(database = db, now = Date.now) {
  async function locked(owner, work) {
    return database.transaction(async q => {
      await q('INSERT IGNORE INTO material_quota_accounts (owner_key) VALUES (?)', [owner.key]);
      const [account] = await q('SELECT * FROM material_quota_accounts WHERE owner_key = ? FOR UPDATE', [owner.key]);
      // Read admin and ban status inside the transaction rather than trusting a stale JWT.
      if (owner.userId) {
        const [user] = await q('SELECT role, status FROM users WHERE id = ?', [owner.userId]);
        if (!user) throw fail(401, 'Account no longer exists.');
        if (user.status === 'banned') throw fail(403, 'This account has been suspended.');
        owner = { ...owner, admin: user.role === 'admin' };
      } else if (owner.ipHash) {
        await q('INSERT IGNORE INTO guest_ip_usage (ip_hash, materials_used) VALUES (?, 0)', [owner.ipHash]);
        const [ipRow] = await q('SELECT materials_used FROM guest_ip_usage WHERE ip_hash = ? FOR UPDATE', [owner.ipHash]);
        if (!ipRow) throw fail(503, 'Guest quota service unavailable.');
        if (Number(ipRow.materials_used) > Number(account.materials_used)) {
          account.materials_used = Number(ipRow.materials_used);
        }
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
    return {
      success: true,
      generationId: id,
      quota: snapshot(account, currentOwner, { id, state: 'pending', charged: 0, expires_at: expires })
    };
  });

  const claim = (owner, id, operation) => locked(owner, async (q, account, pending) => {
    if (!['draft', 'revise'].includes(operation)) throw fail(400, 'Use operation draft or revise.');
    const job = await findJob(q, owner, id);
    if (!pending || pending.id !== job.id || job.state !== 'pending') throw fail(409, 'Generation is not pending or has expired.');
    if (job.draft_state === 'running' || job.revise_state === 'running') throw fail(409, 'A generation operation is already running.');
    if (job[`${operation}_state`] !== 'idle') throw fail(409, 'This generation operation has already succeeded.');
    if (operation === 'revise' && job.draft_state !== 'done') throw fail(409, 'Complete the draft first.');
    const questions = operation === 'revise' ? storedQuestions(job) : null;
    await q(`UPDATE material_generations SET ${operation}_state = 'running' WHERE id = ?`, [id]);
    return { questions };
  });

  // Charge on the FIRST successful generation call, not on the client completion
  // acknowledgement. Otherwise cancelling after receiving AI output bypasses quotas.
  const settle = (owner, id, operation, succeeded, questions) => locked(owner, async (q, account, pending, currentOwner) => {
    if (!['draft', 'revise'].includes(operation)) throw fail(400, 'Invalid operation.');
    const job = await findJob(q, owner, id);
    const canonical = succeeded ? validateQuestions(questions) : null;
    const encoded = canonical ? JSON.stringify(canonical) : null;
    if (job[`${operation}_state`] !== 'running') {
      // Retrying an acknowledgement is safe; different output may never overwrite
      // the committed bank, and a delayed failed acknowledgement cannot undo it.
      if (succeeded && job[`${operation}_state`] === 'done' && JSON.stringify(storedQuestions(job)) === encoded) {
        return { active: pending?.id === id, quota: snapshot(account, currentOwner, pending) };
      }
      throw fail(409, 'Operation is not running.');
    }
    // Never retain, deliver or charge late output after the reservation expired.
    if (!pending || pending.id !== id) {
      await q(`UPDATE material_generations SET ${operation}_state = 'idle' WHERE id = ?`, [id]);
      return { active: false, quota: snapshot(account, currentOwner, pending) };
    }
    if (succeeded) {
      await q(`UPDATE material_generations SET ${operation}_state = 'done', canonical_questions_json = ? WHERE id = ?`, [encoded, id]);
    } else await q(`UPDATE material_generations SET ${operation}_state = 'idle' WHERE id = ?`, [id]);
    if (succeeded && !Number(job.charged)) {
      await q('UPDATE material_quota_accounts SET materials_used = materials_used + 1 WHERE owner_key = ?', [owner.key]);
      await q('UPDATE material_generations SET charged = 1 WHERE id = ?', [id]);
      account.materials_used = Number(account.materials_used) + 1;
      job.charged = 1;
      if (!currentOwner.userId && currentOwner.ipHash) {
        await q('UPDATE guest_ip_usage SET materials_used = materials_used + 1 WHERE ip_hash = ?', [currentOwner.ipHash]);
      }
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
    if (!pending || pending.id !== id || job.draft_state !== 'done' || job.revise_state === 'running' || !Number(job.charged)) {
      throw fail(409, 'A successful, non-running draft is required before completion.');
    }
    const { title, contentPreview = '', sourceFilename = '' } = body || {};
    // The completion acknowledgement is metadata only. Browser question content
    // is deliberately ignored, including forged, reordered or malformed banks.
    const questions = storedQuestions(job);
    if (
      typeof title !== 'string' || !title.trim() || title.length > 255 ||
      typeof contentPreview !== 'string' || contentPreview.length > 16000 ||
      typeof sourceFilename !== 'string' || sourceFilename.length > 255
    ) {
      throw fail(400, 'A valid title and bounded material metadata are required.');
    }
    let materialId = null;
    if (owner.userId) {
      const result = await q(
        'INSERT INTO materials (user_id, title, content_preview, source_filename, questions_json, total_questions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [owner.userId, title.trim(), contentPreview, sourceFilename, JSON.stringify(questions), questions.length]
      );
      materialId = result.insertId;
    }
    await q("UPDATE material_generations SET state = 'completed', material_id = ? WHERE id = ?", [materialId, id]);
    if (materialId) await q('UPDATE ai_usage SET material_id = ? WHERE generation_id = ? AND owner_key = ? AND material_id IS NULL', [materialId, id, owner.key]);
    await q('UPDATE material_quota_accounts SET pending_generation_id = NULL WHERE owner_key = ?', [owner.key]);
    return { success: true, materialId, quota: snapshot(account, currentOwner, null) };
  });

  const authorizeExisting = async (owner, { materialId, generationId } = {}) => {
    if (owner.userId && materialId !== undefined && materialId !== null && materialId !== '') {
      if (!Number.isSafeInteger(Number(materialId)) || Number(materialId) < 1) {
        throw fail(400, 'An owned materialId is required.');
      }
      const rows = await database.query('SELECT id FROM materials WHERE id = ? AND user_id = ?', [Number(materialId), owner.userId]);
      if (!rows.length) throw fail(403, 'Material ownership is required.');
      return { materialId: Number(materialId), generationId: null };
    }
    if (typeof generationId === 'string' && /^[0-9a-f-]{36}$/i.test(generationId)) {
      const rows = await database.query(
        "SELECT id, material_id FROM material_generations WHERE id = ? AND owner_key = ? AND (state = 'completed' OR charged = 1)",
        [generationId, owner.key]
      );
      if (!rows.length) throw fail(403, 'A completed generation belonging to this account or device is required.');
      return { materialId: rows[0].material_id || null, generationId };
    }
    if (owner.userId) {
      throw fail(400, 'An owned materialId or completed generationId is required.');
    }
    throw fail(400, 'A completed generationId is required.');
  };

  const setLimit = async (id, materialLimit) => {
    if (
      !Number.isSafeInteger(Number(id)) || Number(id) < 1 ||
      (materialLimit !== null && (!Number.isSafeInteger(materialLimit) || materialLimit < 0 || materialLimit > 4294967295))
    ) {
      throw fail(400, 'materialLimit must be a nonnegative integer or null.');
    }
    return locked({ key: `user:${Number(id)}`, userId: Number(id), admin: false }, async (q, account, pending, owner) => {
      await q('UPDATE material_quota_accounts SET material_limit = ? WHERE owner_key = ?', [materialLimit, owner.key]);
      account.material_limit = materialLimit;
      return { success: true, quota: snapshot(account, owner, pending) };
    });
  };

  const addCredits = async (id, materialsToAdd) => {
    const count = Number(materialsToAdd);
    if (!Number.isSafeInteger(Number(id)) || Number(id) < 1 || !Number.isSafeInteger(count) || count < 1 || count > 100000) {
      throw fail(400, 'materialsToAdd must be a positive integer.');
    }
    return locked({ key: `user:${Number(id)}`, userId: Number(id), admin: false }, async (q, account, pending, owner) => {
      if (account.material_limit !== null) {
        const nextLimit = Number(account.material_limit ?? 1) + count;
        if (nextLimit > 4294967295) throw fail(409, 'Credit balance limit exceeded.');
        await q('UPDATE material_quota_accounts SET material_limit = ? WHERE owner_key = ?', [nextLimit, owner.key]);
        account.material_limit = nextLimit;
      }
      return { success: true, quota: snapshot(account, owner, pending) };
    });
  };

  return { read, start, claim, settle, cancel, complete, authorizeExisting, setLimit, addCredits };
}

module.exports = {
  createQuotaService,
  ownerFor,
  signGuestDevice,
  verifyGuestDevice,
  RESERVATION_MS,
  ...createQuotaService()
};
