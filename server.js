const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { initDb, query, transaction, isDbConnected, getAppVersion, setAppVersion } = require('./db');
const {
  generateToken,
  verifyGoogleToken,
  findOrCreateUser,
  authenticateToken,
  requireAuth,
  requireAdmin,
  parseCookies,
  validateAuthConfiguration
} = require('./auth');
const {
  handleAiGenerate,
  SETTINGS_KEYS,
  maskSettingsForAdmin,
  mergeAdminSettingsUpdate
} = require('./ai_proxy');
const materialQuota = require('./material_quota');
const { positiveId, modeValue, validateProgress } = require('./progress_validation');
const { renderLegalPage, getPublicLegalConfig } = require('./legal_pages');
const { createErrorTracker } = require('./error_tracking');
const { createWebhookNotifier } = require('./monitoring');

// Operational reports never receive raw exceptions, request bodies or identities.
const { version: RELEASE_VERSION, build: RELEASE_BUILD } = require('./release.cjs');
const diagnostics = createErrorTracker({
  release: RELEASE_BUILD,
  notify: event => createWebhookNotifier()(event),
  assets: (() => {
    try { return require('node:fs').readdirSync(path.join(__dirname, 'dist', 'assets')).filter(name => /^(app|policy|diagnostics)-[a-f0-9]+\.js$/.test(name)); }
    catch { return []; }
  })()
});

const { createPaymentService } = require('./payment_service');
const payments = createPaymentService({ query, transaction });
const CREDIT_PACKS = payments.packs();

const GUEST_COOKIE_NAME = 'fl_guest';

function resolveGuestDevice(req, res) {
  const cookies = parseCookies(req.headers['cookie']);
  const verifiedFromCookie = materialQuota.verifyGuestDevice(cookies[GUEST_COOKIE_NAME]);
  if (verifiedFromCookie) return verifiedFromCookie;

  const headerDevice = req.get('X-Guest-Device');
  if (typeof headerDevice === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(headerDevice)) {
    const signed = materialQuota.signGuestDevice(headerDevice);
    if (signed && res && !res.headersSent) {
      const parts = [
        `${GUEST_COOKIE_NAME}=${encodeURIComponent(signed)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${365 * 24 * 60 * 60}`
      ];
      if (process.env.NODE_ENV === 'production') parts.push('Secure');
      res.append('Set-Cookie', parts.join('; '));
    }
    return headerDevice;
  }
  return headerDevice;
}

const quotaOwner = (req, res) => materialQuota.ownerFor(req.user, resolveGuestDevice(req, res), req.ip);

const publicUser = (user, quota) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatar: user.avatar || '',
  avatar_url: user.avatar || '',
  role: user.role,
  status: user.status || 'active',
  auth_provider: user.auth_provider || 'google',
  provider: user.auth_provider || 'google',
  has_server_ai_access: user.role === 'admin' || quota.materialLimit === null || quota.remaining > 0,
  ai_calls_count: user.ai_calls_count || 0,
  material_limit: quota.materialLimit,
  materials_used: quota.materialsUsed,
  quota
});

function quotaError(res, error) {
  const status = [400, 401, 403, 404, 409, 429, 502, 503, 504].includes(error.status) ? error.status : 503;
  if (status >= 500) diagnostics.captureServer({ code: 'HTTP_5XX', status });
  return res.status(status).json({
    success: false,
    message: status === 503 ? 'Service temporarily unavailable.' : error.message,
    ...(status === 409 && Number.isSafeInteger(error.revision) ? { revision: error.revision } : {})
  });
}

const app = express();
const PORT = process.env.PORT || 3025;

// Only local reverse proxies are trusted unless explicit IPs/CIDRs are configured.
app.set('trust proxy', (process.env.TRUST_PROXY || 'loopback').split(',').map(value => value.trim()).filter(Boolean));
app.disable('x-powered-by');

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://accounts.google.com https://*.gstatic.com https://cdn.moyasar.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      "form-action 'self' https://api.moyasar.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://accounts.google.com https://cdn.moyasar.com",
      "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' data: blob:",
      "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://api.moyasar.com",
      "frame-src 'self' https://accounts.google.com https://appleid.apple.com https://api.moyasar.com"
    ].join('; ')
  );
  next();
});

const allowedOrigins = (process.env.CORS_ORIGINS || 'https://villa.linkflow.page')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const originAllowed = origin => allowedOrigins.includes(origin) ||
  (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin));
app.use(cors({ origin: (origin, callback) => callback(null, !origin || originAllowed(origin)), credentials: false }));
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin && !originAllowed(origin)) {
    return res.status(403).json({ success: false, message: 'Origin not allowed.' });
  }
  next();
});

// Normalize before parsing so parser failures on either API path stay JSON.
app.use((req, res, next) => {
  if (req.path === '/teachnator') return res.redirect(308, '/teachnator/' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''));
  if (req.path === '/fast-learning') return res.redirect(308, '/teachnator/' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''));
  const subpath = req.url.match(/^\/(teachnator|fast-learning)(?=\/)/);
  req.publicBasePath = subpath ? subpath[0] : '';
  if (subpath) req.url = req.url.replace(/^\/(teachnator|fast-learning)(?=\/)/, '');
  next();
});

// Bounded uploads: 15MB AI input, 2MB banks/progress, 256KB other JSON.
const clientReportParser = express.json({ limit: '8kb' });
const aiBodyParser = express.json({ limit: '15mb' });
const materialBodyParser = express.json({ limit: '2mb' });
const defaultJsonParser = express.json({ limit: '256kb' });
const defaultUrlencodedParser = express.urlencoded({ extended: true, limit: '256kb' });

app.use((req, res, next) => {
  if (req.path === '/api/client-errors') return clientReportParser(req, res, next);
  if (req.path === '/api/ai/generate') {
    return aiBodyParser(req, res, next);
  }
  if (req.path === '/api/progress' || req.path === '/api/materials' || /^\/api\/material-generations\/[^/]+\/complete$/.test(req.path)) {
    return materialBodyParser(req, res, next);
  }
  return defaultJsonParser(req, res, err => {
    if (err) return next(err);
    return defaultUrlencodedParser(req, res, next);
  });
});

app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));
app.get('/api/ready', async (req, res) => {
  try {
    if (!isDbConnected()) throw new Error('Unavailable');
    await query('SELECT 1');
    res.json({ success: true, status: 'ready' });
  } catch (_) {
    res.status(503).json({ success: false, status: 'unavailable' });
  }
});

// Policies and minimal crash reporting remain available without a valid session.
for (const page of ['privacy', 'terms', 'contact']) {
  app.get('/' + page, (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.type('html').send(renderLegalPage(page, { basePath: req.publicBasePath })); }
    catch {
      diagnostics.captureServer({ code: 'INTERNAL_ERROR', route: '/' + page, status: 503 });
      res.status(503).type('text/plain').send('Policy configuration unavailable.');
    }
  });
}
app.post('/api/client-errors', (req, res) => {
  const origin = req.get('Origin');
  if (!origin || !originAllowed(origin)) return res.status(403).json({ success: false, message: 'Origin not allowed.' });
  // Map the finite UI code vocabulary; never forward arbitrary browser metadata.
  const clientCodes = {
    runtime_error: 'CLIENT_RUNTIME_ERROR', unhandled_rejection: 'CLIENT_UNHANDLED_REJECTION',
    render_failed: 'CLIENT_RENDER_ERROR', progress_conflict: 'CLIENT_RUNTIME_ERROR',
    progress_save_failed: 'CLIENT_RUNTIME_ERROR', local_save_failed: 'CLIENT_RUNTIME_ERROR', audio_failed: 'CLIENT_RUNTIME_ERROR'
  };
  const input = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const report = { code: clientCodes[input.code] || input.code, asset: input.asset || input.source, line: input.line, column: input.column };
  const result = diagnostics.captureClient(report, { rateKey: req.ip || 'unknown' });
  if (!result.accepted) return res.status(result.reason === 'rate_limited' ? 429 : 400).json({ success: false, message: 'Report not accepted.' });
  res.status(204).end();
});

// تطبيق فحص التوكن العام لجميع الطلبات
app.use(authenticateToken);

// ==========================================
// 1. مسارات المصادقة (Google & Session Management)
// ==========================================

app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ success: false, message: 'معرّف Google (idToken) مطلوب' });
    }

    const payload = await verifyGoogleToken(idToken);

    const user = await findOrCreateUser({
      email: payload.email,
      name: payload.name,
      avatar: payload.avatar,
      provider: 'google',
      providerId: payload.providerId
    });

    const token = generateToken(user);
    res.json({
      success: true,
      token,
      user: publicUser(user, await materialQuota.read(materialQuota.ownerFor(user)))
    });
  } catch (err) {
    quotaError(res, err);
  }
});

app.post('/api/auth/apple', async (req, res) => {
  return res.status(501).json({
    success: false,
    message: 'Apple sign-in is disabled until full cryptographic verification is configured.'
  });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    await query('UPDATE users SET session_version = session_version + 1 WHERE id = ?', [req.user.id]);
    res.json({ success: true });
  } catch (_) {
    res.status(503).json({ success: false, message: 'Session service unavailable.' });
  }
});

if (process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_LOGIN === 'true') {
  app.post('/api/auth/dev-login', async (req, res) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip)) return res.status(404).json({ success: false, message: 'Not found' });
    try {
      const { email, name, role } = req.body || {};
      if (!email) {
        return res.status(400).json({ success: false, message: 'البريد الإلكتروني مطلوب' });
      }

      const user = await findOrCreateUser({
        email,
        name: name || email.split('@')[0],
        avatar: '',
        provider: 'google',
        providerId: 'dev_' + Date.now()
      });

      if (role && (role === 'admin' || role === 'user')) {
        await query('UPDATE users SET role = ?, has_server_ai_access = ? WHERE id = ?', [
          role,
          role === 'admin' ? 1 : user.has_server_ai_access,
          user.id
        ]);
        user.role = role;
        if (role === 'admin') user.has_server_ai_access = 1;
      }

      const token = generateToken(user);
      res.json({
        success: true,
        token,
        user: publicUser(user, await materialQuota.read(materialQuota.ownerFor(user)))
      });
    } catch (err) {
      quotaError(res, err);
    }
  });
} else {
  app.post('/api/auth/dev-login', (req, res) => {
    res.status(404).json({ success: false, message: 'Not found' });
  });
}

app.get('/api/auth/me', async (req, res) => {
  if (!req.user) return res.json({ authenticated: false, user: null });
  try {
    const quota = await materialQuota.read(quotaOwner(req, res));
    res.json({ authenticated: true, user: publicUser(req.user, quota) });
  } catch (error) {
    quotaError(res, error);
  }
});

// ==========================================
// 2. وسيط الذكاء الاصطناعي (AI Proxy & Quota)
// ==========================================

const aiRateWindows = new Map();
const AI_WINDOW_MS = 60000;
const AI_REQUEST_LIMIT = 20;

function limitAiRequests(req, res, next) {
  const now = Date.now();
  for (const [k, bucket] of aiRateWindows) {
    if (bucket.resetAt <= now) aiRateWindows.delete(k);
  }
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const keys = [`ip:${ip}`];
  if (req.user?.id) keys.push(`user:${req.user.id}`);

  for (const key of keys) {
    let bucket = aiRateWindows.get(key);
    if (!bucket) {
      if (aiRateWindows.size >= 10000) {
        return res.status(429).json({ success: false, message: 'الخدمة مشغولة، حاول لاحقاً.' });
      }
      bucket = { count: 0, resetAt: now + AI_WINDOW_MS };
      aiRateWindows.set(key, bucket);
    }
    if (++bucket.count > AI_REQUEST_LIMIT) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, message: 'تم تجاوز حد الطلبات، حاول بعد دقيقة.' });
    }
  }
  next();
}

app.post('/api/ai/generate', limitAiRequests, async (req, res) => {
  // Reject malformed bodies before auth for a consistent JSON validation contract.
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || !Object.keys(req.body).length) {
    return res.status(400).json({ success: false, message: 'An AI operation is required.' });
  }
  // All provider-funded operations (draft/revise/evaluation/TTS) are signed-in only.
  // Local demo study never needs this endpoint.
  if (!req.user) return res.status(401).json({ success: false, message: 'Sign in to use AI services.' });
  if (req.setTimeout) req.setTimeout(0);
  if (res.setTimeout) res.setTimeout(0);
  const guestDevice = resolveGuestDevice(req, res);
  res.set('Cache-Control', 'no-store, no-transform');
  res.set('X-Accel-Buffering', 'no');
  const heartbeat = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) {
      if (!res.headersSent) res.type('json');
      res.write(' \n');
    }
  }, 10000);
  heartbeat.unref();
  res.once('close', () => clearInterval(heartbeat));
  const reply = (status, body) => {
    clearInterval(heartbeat);
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) res.end(JSON.stringify(body));
    else res.status(status).json(body);
  };
  try {
    const result = await handleAiGenerate(req.user, req.body, {
      guestDevice,
      clientIp: req.ip
    });
    reply(200, result);
  } catch (err) {
    const status = [400, 401, 403, 404, 409, 429, 502, 503, 504].includes(err.status) ? err.status : 500;
    diagnostics.captureServer({ code: 'AI_REQUEST_FAILED', route: '/api/ai/generate', status });
    reply(status, {
      success: false,
      message: status === 500 ? 'حدث خطأ أثناء معالجة طلب الذكاء الاصطناعي' : err.message
    });
  }
});

// Durable material allowance and owner-bound generation lifecycle.
app.get('/api/material-quota', async (req, res) => {
  try {
    res.json({ success: true, quota: await materialQuota.read(quotaOwner(req, res)) });
  } catch (error) {
    quotaError(res, error);
  }
});

app.post('/api/material-generations/start', requireAuth, limitAiRequests, async (req, res) => {
  try {
    res.json(await materialQuota.start(quotaOwner(req, res)));
  } catch (error) {
    quotaError(res, error);
  }
});

app.post('/api/material-generations/:id/complete', requireAuth, async (req, res) => {
  try {
    res.json(await materialQuota.complete(quotaOwner(req, res), req.params.id, req.body));
  } catch (error) {
    quotaError(res, error);
  }
});

app.delete('/api/material-generations/:id', requireAuth, async (req, res) => {
  try {
    res.json(await materialQuota.cancel(quotaOwner(req, res), req.params.id));
  } catch (error) {
    quotaError(res, error);
  }
});

// ==========================================
// 3. الباقات والدفع والترقية (Monetization & Credit Packs)
// ==========================================

app.get('/api/billing/packs', async (req, res) => {
  let quota = null;
  if (req.user) {
    try {
      quota = await materialQuota.read(quotaOwner(req, res));
    } catch (_) {}
  }
  res.json({
    success: true,
    packs: payments.enabled() ? payments.packs() : [],
    paymentEnabled: payments.enabled(),
    paymentProvider: 'moyasar',
    moyasarPublishableKey: payments.enabled() ? process.env.MOYASAR_PUBLISHABLE_KEY : '',
    supportEmail: process.env.SUPPORT_EMAIL || '',
    supportWhatsapp: process.env.SUPPORT_WHATSAPP || '',
    quota
  });
});

app.post('/api/billing/checkout', requireAuth, async (req, res) => {
  try {
    res.json(await payments.checkout(req.user, req.body?.packId));
  } catch (error) { quotaError(res, error); }
});

app.post('/api/billing/webhook', async (req, res) => {
  try {
    res.json(await payments.webhook(req.body, req.get('X-Webhook-Secret') || req.body?.secret_token));
  } catch (error) { quotaError(res, error); }
});

// ==========================================
// 4. إدارة المواد الدراسية (Materials)
// ==========================================

app.get('/api/materials', requireAuth, async (req, res) => {
  try {
    const sql = `
      SELECT m.id, m.title, m.content_preview, m.source_filename, m.total_questions, m.created_at, m.updated_at,
             p.mode as last_mode, p.current_index, p.score, p.is_completed, p.updated_at as last_played_at
      FROM materials m
      LEFT JOIN (
        SELECT up.id, up.material_id, up.user_id, up.mode, up.current_index, up.score, up.is_completed, up.updated_at
        FROM user_progress up
        INNER JOIN (
          SELECT material_id, user_id, MAX(updated_at) as max_updated
          FROM user_progress
          GROUP BY material_id, user_id
        ) latest ON up.material_id = latest.material_id AND up.user_id = latest.user_id AND up.updated_at = latest.max_updated
      ) p ON p.material_id = m.id AND p.user_id = m.user_id
      WHERE m.user_id = ?
      ORDER BY m.updated_at DESC
    `;
    const rows = await query(sql, [req.user.id]);
    const materials = rows.map(r => ({
      ...r,
      total_questions: r.total_questions || 0,
      question_count: r.total_questions || 0,
      progress: (r.current_index !== null && r.current_index !== undefined) ? {
        mode: r.last_mode,
        current_index: Number(r.current_index) || 0,
        score: Number(r.score) || 0,
        is_completed: Number(r.is_completed) || 0,
        last_played_at: r.last_played_at
      } : null
    }));
    res.json({ success: true, materials });
  } catch (err) {
    quotaError(res, err);
  }
});

app.post('/api/materials', requireAuth, async (req, res) => {
  try {
    res.json(await materialQuota.complete(quotaOwner(req, res), req.body?.generationId, req.body));
  } catch (error) {
    quotaError(res, error);
  }
});

app.get('/api/materials/:id', requireAuth, async (req, res) => {
  try {
    const materialId = positiveId(req.params.id);
    const rows = await query(
      'SELECT * FROM materials WHERE id = ? AND (user_id = ? OR ? = "admin")',
      [materialId, req.user.id, req.user.role]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'المادة غير موجودة أو ليس لديك إذن بالوصول إليها' });
    }

    const material = rows[0];
    try {
      material.questions = JSON.parse(material.questions_json);
    } catch (_) {
      material.questions = [];
    }
    delete material.questions_json;

    res.json({ success: true, material });
  } catch (err) {
    quotaError(res, err);
  }
});

app.delete('/api/materials/:id', requireAuth, async (req, res) => {
  try {
    const materialId = positiveId(req.params.id);
    await transaction(async q => {
      const [owned] = await q('SELECT id FROM materials WHERE id = ? AND user_id = ? FOR UPDATE', [materialId, req.user.id]);
      if (!owned) throw Object.assign(new Error('Owned material not found.'), { status: 404 });
      await q('DELETE FROM user_progress WHERE material_id = ?', [materialId]);
      await q('UPDATE material_generations SET material_id = NULL WHERE material_id = ?', [materialId]);
      await q('DELETE FROM ai_usage WHERE material_id = ? AND user_id = ?', [materialId, req.user.id]);
      await q('DELETE FROM materials WHERE id = ? AND user_id = ?', [materialId, req.user.id]);
    });
    res.json({ success: true, message: 'تم حذف المادة بنجاح' });
  } catch (err) {
    quotaError(res, err);
  }
});

// ==========================================
// 5. حفظ واستئناف تقدم الاختبار (Progress & Resume)
// ==========================================

app.get('/api/progress/:materialId', requireAuth, async (req, res) => {
  try {
    const materialId = positiveId(req.params.materialId);
    const mode = modeValue(req.query.mode || 'speed');
    const [owned] = await query('SELECT id FROM materials WHERE id = ? AND user_id = ?', [materialId, req.user.id]);
    if (!owned) return res.status(404).json({ success: false, message: 'Owned material not found.' });

    const rows = await query(
      'SELECT * FROM user_progress WHERE user_id = ? AND material_id = ? AND mode = ?',
      [req.user.id, materialId, mode]
    );

    if (rows.length === 0) {
      return res.json({ success: true, progress: null, revision: 0 });
    }

    const progress = { ...rows[0] };
    if (progress.state_json) {
      try {
        progress.state = JSON.parse(progress.state_json);
      } catch (_) {
        progress.state = null;
      }
    }

    delete progress.state_json;
    res.json({ success: true, progress, revision: Number(progress.save_revision) || 0 });
  } catch (err) {
    quotaError(res, err);
  }
});

app.post('/api/progress', requireAuth, async (req, res) => {
  try {
    const { materialId, mode, currentIndex, score, totalQuestions, correctCount, wrongCount, stateJson, isCompleted, saveRevision: expectedRevision } = validateProgress({ ...req.body, saveRevision: req.body?.expectedRevision });
    const revision = await transaction(async q => {
      // The owned material lock serializes both first checkpoints and updates.
      const [material] = await q('SELECT id, total_questions FROM materials WHERE id = ? AND user_id = ? FOR UPDATE', [materialId, req.user.id]);
      if (!material) throw Object.assign(new Error('Owned material not found.'), { status: 404 });
      const [previous] = await q('SELECT save_revision FROM user_progress WHERE user_id = ? AND material_id = ? AND mode = ? FOR UPDATE', [req.user.id, materialId, mode]);
      const currentRevision = Number(previous?.save_revision) || 0;
      if (expectedRevision !== currentRevision) {
        throw Object.assign(new Error('Progress changed in another session. Resume the latest checkpoint before saving again.'), { status: 409, revision: currentRevision });
      }
      if (!Number.isSafeInteger(currentRevision) || currentRevision >= Number.MAX_SAFE_INTEGER) {
        throw Object.assign(new Error('Progress revision limit reached.'), { status: 409 });
      }
      const nextRevision = currentRevision + 1;
      await q(
        `INSERT INTO user_progress
          (user_id, material_id, mode, current_index, score, total_questions, correct_count, wrong_count, state_json, is_completed, save_revision, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
          current_index = VALUES(current_index), score = VALUES(score), total_questions = VALUES(total_questions),
          correct_count = VALUES(correct_count), wrong_count = VALUES(wrong_count), state_json = VALUES(state_json),
          is_completed = VALUES(is_completed), save_revision = VALUES(save_revision), updated_at = NOW()`,
        [req.user.id, materialId, mode, currentIndex, score, totalQuestions, correctCount, wrongCount, stateJson, isCompleted, nextRevision]
      );
      return nextRevision;
    });
    // Each study mode is an independent resume point. Never delete another mode here.
    res.json({ success: true, revision, message: 'تم حفظ التقدم بنجاح' });
  } catch (error) { quotaError(res, error); }
});

app.delete('/api/progress/:materialId', requireAuth, async (req, res) => {
  try {
    const materialId = positiveId(req.params.materialId);
    const mode = req.query.mode === undefined ? null : modeValue(req.query.mode);
    const [owned] = await query('SELECT id FROM materials WHERE id = ? AND user_id = ?', [materialId, req.user.id]);
    if (!owned) return res.status(404).json({ success: false, message: 'Owned material not found.' });
    // Keep a monotonic revision tombstone: deleting the row would let an old
    // revision-zero browser tab resurrect a checkpoint after reset.
    await transaction(async q => {
      await q('SELECT id FROM materials WHERE id = ? AND user_id = ? FOR UPDATE', [materialId, req.user.id]);
      await q(`UPDATE user_progress SET current_index = 0, score = 0, correct_count = 0, wrong_count = 0,
        state_json = NULL, is_completed = 0, save_revision = save_revision + 1, updated_at = NOW()
        WHERE user_id = ? AND material_id = ?${mode ? ' AND mode = ?' : ''}`, mode ? [req.user.id, materialId, mode] : [req.user.id, materialId]);
    });
    res.json({ success: true, message: 'تمت إعادة تعيين التقدم' });
  } catch (err) {
    quotaError(res, err);
  }
});

// ==========================================
// 6. إعدادات المستخدم الشخصية (User Settings)
// ==========================================

app.post('/api/user/settings', requireAuth, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (Object.keys(req.body || {}).some(key => key !== 'name') || typeof name !== 'string' || name.trim().length > 255) {
      return res.status(400).json({ success: false, message: 'يمكن تحديث الاسم فقط (حتى 255 حرفاً).' });
    }
    await query(
      'UPDATE users SET name = COALESCE(NULLIF(?, ""), name) WHERE id = ?',
      [name.trim(), req.user.id]
    );

    res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح' });
  } catch (err) {
    quotaError(res, err);
  }
});

// ==========================================
// 7. لوحة تحكم المشرف الشاملة (Admin Dashboard)
// ==========================================

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const [userStats] = await query(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN has_server_ai_access = 1 THEN 1 ELSE 0 END) as active_ai_users,
        SUM(ai_calls_count) as total_ai_calls
      FROM users
    `);

    const [materialStats] = await query(`
      SELECT COUNT(*) as total_materials FROM materials
    `);

    const [quizStats] = await query(`
      SELECT 
        COUNT(*) as total_quiz_sessions,
        SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) as completed_quizzes
      FROM user_progress
    `);

    let usageStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      cachedTtsHits: 0,
      todayAiCalls: 0,
      estimatedCostUsd: null
    };
    try {
      const [uRow] = await query(`
        SELECT
          COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
          COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
          COALESCE(SUM(CASE WHEN cached = 1 THEN 1 ELSE 0 END), 0) AS cached_tts_hits,
          COALESCE(SUM(CASE WHEN created_at >= (NOW() - INTERVAL 1 DAY) THEN 1 ELSE 0 END), 0) AS today_ai_calls
        FROM ai_usage
      `);
      const inTok = Number(uRow?.total_input_tokens || 0);
      const outTok = Number(uRow?.total_output_tokens || 0);
      // Mixed models/audio cannot be priced with a fictitious blended token rate.
      // Provider billing remains authoritative until per-model pricing is configured.
      const estUsd = null;
      usageStats = {
        totalInputTokens: inTok,
        totalOutputTokens: outTok,
        cachedTtsHits: Number(uRow?.cached_tts_hits || 0),
        todayAiCalls: Number(uRow?.today_ai_calls || 0),
        estimatedCostUsd: estUsd,
        costEstimateAvailable: false
      };
    } catch (_) {}

    res.json({
      success: true,
      stats: {
        totalUsers: userStats.total_users || 0,
        activeAiUsers: userStats.active_ai_users || 0,
        totalAiCalls: userStats.total_ai_calls || 0,
        totalMaterials: materialStats.total_materials || 0,
        totalQuizSessions: quizStats.total_quiz_sessions || 0,
        completedQuizzes: quizStats.completed_quizzes || 0,
        dbConnected: isDbConnected(),
        ...usageStats
      }
    });
  } catch (err) {
    quotaError(res, err);
  }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    if (req.query.search !== undefined && (typeof req.query.search !== 'string' || req.query.search.length > 255)) {
      return res.status(400).json({ success: false, message: 'Invalid search.' });
    }
    const search = req.query.search ? `%${req.query.search.trim()}%` : null;
    let sql = `
      SELECT u.id, u.email, u.name, u.avatar, u.auth_provider, u.role, u.status,
             (u.role = 'admin' OR q.material_limit IS NULL OR q.materials_used < q.material_limit) AS has_server_ai_access,
             CASE WHEN u.role = 'admin' THEN NULL ELSE COALESCE(q.material_limit, 1) END AS material_limit,
             COALESCE(q.materials_used, 0) AS materials_used, u.ai_calls_count, u.last_login, u.created_at,
             COUNT(DISTINCT m.id) as materials_count,
             COUNT(DISTINCT p.id) as progress_count
      FROM users u
      LEFT JOIN material_quota_accounts q ON q.owner_key = CONCAT('user:', u.id)
      LEFT JOIN materials m ON m.user_id = u.id
      LEFT JOIN user_progress p ON p.user_id = u.id
    `;
    const params = [];

    if (search) {
      sql += ' WHERE u.email LIKE ? OR u.name LIKE ? ';
      params.push(search, search);
    }

    sql += ' GROUP BY u.id ORDER BY u.created_at DESC';

    const users = await query(sql, params);
    res.json({ success: true, users });
  } catch (err) {
    quotaError(res, err);
  }
});

app.post('/api/admin/users/:id/material-quota', requireAdmin, async (req, res) => {
  try {
    res.json(await materialQuota.setLimit(req.params.id, req.body?.materialLimit));
  } catch (error) {
    quotaError(res, error);
  }
});

app.post('/api/admin/users/:id/grant-pack', requireAdmin, async (req, res) => {
  try {
    const targetUserId = positiveId(req.params.id);
    const { packId, materials } = req.body || {};
    const pack = CREDIT_PACKS.find(p => p.id === packId);
    const materialsToAdd = pack ? pack.materials : Number(materials);
    const result = await materialQuota.addCredits(targetUserId, materialsToAdd);
    res.json({
      success: true,
      message: `تمت إضافة ${materialsToAdd} مواد لحساب المستخدم بنجاح.`,
      ...result
    });
  } catch (error) {
    quotaError(res, error);
  }
});

app.post('/api/admin/users/:id/status', requireAdmin, async (req, res) => {
  try {
    const targetUserId = positiveId(req.params.id);
    if (targetUserId === req.user.id) {
      return res.status(400).json({ success: false, message: 'لا يمكنك إيقاف حسابك الحالي' });
    }
    const status = req.body?.status;
    if (!['active', 'banned'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid account status.' });
    await query('UPDATE users SET status = ?, session_version = session_version + 1 WHERE id = ?', [status, positiveId(req.params.id)]);
    res.json({
      success: true,
      status,
      message: status === 'banned' ? 'تم إيقاف حساب المستخدم فوراً' : 'تم تفعيل حساب المستخدم بنجاح'
    });
  } catch (err) {
    quotaError(res, err);
  }
});

app.post('/api/admin/users/:id/toggle-role', requireAdmin, async (req, res) => {
  try {
    const targetUserId = positiveId(req.params.id);
    if (targetUserId === req.user.id) {
      return res.status(400).json({ success: false, message: 'لا يمكنك تغيير رتبة حسابك الحالي' });
    }

    const { role } = req.body || {};
    if (!['admin', 'user'].includes(role)) return res.status(400).json({ success: false, message: 'Invalid account role.' });
    const targetRole = role;
    await query('UPDATE users SET role = ?, session_version = session_version + 1, has_server_ai_access = IF(? = "admin", 1, has_server_ai_access) WHERE id = ?', [
      targetRole, targetRole, positiveId(req.params.id)
    ]);

    res.json({ success: true, message: `تم تحديث رتبة المستخدم إلى ${targetRole}` });
  } catch (err) {
    quotaError(res, err);
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const targetUserId = positiveId(req.params.id);
    if (targetUserId === req.user.id) {
      return res.status(400).json({ success: false, message: 'لا يمكنك حذف حسابك الحالي' });
    }

    const id = positiveId(req.params.id);
    await transaction(async q => {
      await q('SELECT id FROM users WHERE id = ? FOR UPDATE', [id]);
      await q('DELETE FROM user_progress WHERE user_id = ? OR material_id IN (SELECT id FROM materials WHERE user_id = ?)', [id, id]);
      await q('DELETE FROM ai_usage WHERE user_id = ? OR owner_key = ?', [id, `user:${id}`]);
      await q('DELETE FROM ai_daily_budgets WHERE owner_key = ?', [`user:${id}`]);
      await q('DELETE FROM material_generations WHERE user_id = ? OR owner_key = ?', [id, `user:${id}`]);
      await q('DELETE FROM material_quota_accounts WHERE owner_key = ?', [`user:${id}`]);
      await q('DELETE FROM payment_orders WHERE user_id = ?', [id]);
      await q('DELETE FROM materials WHERE user_id = ?', [id]);
      await q('DELETE FROM users WHERE id = ?', [id]);
    });
    res.json({ success: true, message: 'تم حذف المستخدم وجميع بياناته بنجاح' });
  } catch (err) {
    quotaError(res, err);
  }
});

// Return masked placeholders for secret keys; never send raw API keys to the browser.
app.get('/api/admin/ai-settings', requireAdmin, async (req, res) => {
  try {
    const rows = await query(
      `SELECT setting_key, setting_value FROM admin_settings WHERE setting_key IN (${SETTINGS_KEYS.map(() => '?').join(',')})`,
      SETTINGS_KEYS
    );
    const rawSettings = {};
    for (const row of rows) {
      rawSettings[row.setting_key] = row.setting_value;
    }
    res.json({ success: true, settings: maskSettingsForAdmin(rawSettings) });
  } catch (err) {
    quotaError(res, err);
  }
});

// Write-only secret updates: empty or masked values keep existing keys in MySQL.
app.post('/api/admin/ai-settings', requireAdmin, async (req, res) => {
  try {
    const { settings } = req.body || {};
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: 'بيانات الإعدادات غير صالحة' });
    }

    const rows = await query(
      `SELECT setting_key, setting_value FROM admin_settings WHERE setting_key IN (${SETTINGS_KEYS.map(() => '?').join(',')})`,
      SETTINGS_KEYS
    );
    const existingSettings = {};
    for (const row of rows) {
      existingSettings[row.setting_key] = row.setting_value;
    }

    const merged = mergeAdminSettingsUpdate(existingSettings, settings);
    for (const [key, val] of Object.entries(merged)) {
      await query(
        'INSERT INTO admin_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()',
        [key, val]
      );
    }

    const updatedRows = await query(
      `SELECT setting_key, setting_value FROM admin_settings WHERE setting_key IN (${SETTINGS_KEYS.map(() => '?').join(',')})`,
      SETTINGS_KEYS
    );
    const updatedRaw = {};
    for (const row of updatedRows) {
      updatedRaw[row.setting_key] = row.setting_value;
    }

    res.json({
      success: true,
      message: 'تم حفظ وتحديث إعدادات الذكاء الاصطناعي بنجاح في قاعدة البيانات ✅',
      settings: maskSettingsForAdmin(updatedRaw)
    });
  } catch (err) {
    quotaError(res, err);
  }
});

app.post('/api/admin/ai-test', requireAdmin, limitAiRequests, async (req, res) => {
  const { type = 'brain' } = req.body || {};
  const start = Date.now();
  try {
    if (type === 'brain') {
      const result = await handleAiGenerate(req.user, {
        purpose: 'brain',
        payload: {
          contents: [{ role: 'user', parts: [{ text: 'Test connection: reply with OK.' }] }],
          generationConfig: { maxOutputTokens: 10 }
        }
      }, { adminTest: true });
      const latency = Date.now() - start;
      const responseText = result?.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return res.json({ success: true, latency, response: responseText.trim() });
    } else if (type === 'tts') {
      const result = await handleAiGenerate(req.user, {
        purpose: 'tts',
        operation: 'evaluate',
        payload: {
          contents: [{ role: 'user', parts: [{ text: 'مرحباً، تم فحص الصوت بنجاح.' }] }]
        }
      }, { adminTest: true });
      const latency = Date.now() - start;
      const hasAudio = Boolean(result?.data?.candidates?.[0]?.content?.parts?.some(part => part.inlineData?.data));
      if (!hasAudio) throw Object.assign(new Error('No audio returned.'), { status: 502 });
      return res.json({ success: true, latency, hasAudio });
    }
    res.status(400).json({ success: false, message: 'نوع الاختبار غير صالح' });
  } catch (err) {
    diagnostics.captureServer({ code: 'AI_UPSTREAM_FAILURE', route: '/api/admin/:operation', status: [400, 401, 403, 429, 502, 503, 504].includes(err.status) ? err.status : 500 });
    res.status(err.status || 500).json({
      success: false,
      message: 'AI provider test failed.',
      latency: Date.now() - start
    });
  }
});

app.post('/api/admin/version', requireAdmin, async (req, res) => {
  try {
    const { version, build, forceReload } = req.body || {};
    const updated = await setAppVersion({ version, build, forceReload });
    res.json({ success: true, message: 'تم تحديث إصدار التطبيق بنجاح في قاعدة البيانات (MySQL)', ...updated });
  } catch (err) {
    quotaError(res, err);
  }
});

// ==========================================
// 8. الإعدادات العامة للواجهة والتحقق من الإصدار (Public Config & Version)
// ==========================================

app.get('/api/version', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try {
    const versionInfo = await getAppVersion();
    res.json({
      success: true,
      ...versionInfo,
      // The running bundle, not an independently edited DB label, is the release.
      version: RELEASE_VERSION,
      build: RELEASE_BUILD,
      audioEngine: 'ai_only_no_robot',
      timestamp: Date.now()
    });
  } catch (_) {
    res.json({
      success: true,
      version: RELEASE_VERSION,
      build: RELEASE_BUILD,
      forceReload: false,
      audioEngine: 'ai_only_no_robot',
      timestamp: Date.now()
    });
  }
});

app.get('/api/config', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  let versionInfo = { version: RELEASE_VERSION, build: RELEASE_BUILD, forceReload: false };
  try {
    versionInfo = await getAppVersion();
  } catch (_) {}
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    appleClientId: '', // Apple Sign-In hidden until cryptographic verification is configured
    dbConnected: isDbConnected(),
    version: RELEASE_VERSION,
    build: RELEASE_BUILD,
    forceReload: versionInfo.forceReload,
    audioEngine: 'ai_only_no_robot',
    packs: payments.enabled() ? payments.packs() : [],
    paymentEnabled: payments.enabled(),
    requireSignInForAi: true,
    supportEmail: getPublicLegalConfig().support.email || '',
    supportWhatsapp: getPublicLegalConfig().support.whatsapp || '',
    legal: getPublicLegalConfig(process.env, { basePath: req.publicBasePath })
  });
});

// API failures must never fall through to Express HTML or the app shell.
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'مسار API غير موجود. حدّث خادم التطبيق ثم حاول مرة أخرى.' });
});

app.use((error, req, res, next) => {
  if (req.path !== '/api' && !req.path.startsWith('/api/')) return next(error);
  if (res.headersSent) return next(error);
  const status = error.type === 'entity.too.large' ? 413
    : error.type === 'entity.parse.failed' ? 400 : 500;
  if (status >= 500) diagnostics.captureServer({ code: 'INTERNAL_ERROR', status });
  const message = status === 413 ? 'حجم المرفقات كبير جداً. قلّل حجم الملفات أو عددها ثم حاول مرة أخرى.'
    : status === 400 ? 'بيانات الطلب غير صالحة. أعد المحاولة.'
    : 'حدث خطأ في خادم التطبيق. حاول مرة أخرى لاحقاً.';
  res.status(status).json({ success: false, message });
});

// ==========================================
// 9. تقديم الملفات الثابتة والواجهة (Static Files)
// ==========================================

const DIST_DIRECTORY = path.join(__dirname, 'dist');
// Only generated public assets are exposed; never serve the repository root.
app.use('/assets', express.static(path.join(DIST_DIRECTORY, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
app.use((error, req, res, next) => {
  if (!req.path.startsWith('/assets/')) return next(error);
  res.status(error.status === 404 ? 404 : 503).type('text/plain').send('Asset unavailable.');
});
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path === '/api' || req.path.startsWith('/api/')) return next();
  if (req.path === '/') {
    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(path.join(DIST_DIRECTORY, 'index.html'), error => {
      if (error && !res.headersSent) res.status(503).type('text/plain').send('Frontend unavailable. Run npm run build before starting the app.');
    });
  }
  // Unknown paths must not return the app, especially .env, source and backup paths.
  res.status(404).type('text/plain').send('Not found.');
});

async function startServer() {
  validateAuthConfiguration();
  const ready = await initDb();
  if (!ready && process.env.NODE_ENV === 'production') throw new Error('Database unavailable; refusing production startup.');
  await require('node:fs/promises').access(path.join(DIST_DIRECTORY, 'index.html'));

  return app.listen(PORT, process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : 'localhost'), () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n===========================================`);
    console.log(`🚀 المولد الذكي للاختبارات يعمل الآن على:`);
    console.log(`👉 ${url}`);
    console.log(`💾 قاعدة البيانات: ${isDbConnected() ? 'متصلة ✅' : 'غير متصلة ⚠️ (راجع .env)'}`);
    console.log(`===========================================\n`);

    if (!process.env.NO_OPEN && process.env.NODE_ENV !== 'production') {
      const startCmd = process.platform === 'darwin' ? 'open' :
                       process.platform === 'win32' ? 'start' : 'xdg-open';
      try {
        exec(`${startCmd} ${url}`);
      } catch (_) {}
    }
  });
}

if (require.main === module) {
  startServer().catch(() => {
    diagnostics.captureServer({ code: 'INTERNAL_ERROR', status: 503 });
    process.exitCode = 1;
  });
}

module.exports = { app, startServer, CREDIT_PACKS };
