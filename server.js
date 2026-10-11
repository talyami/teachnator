const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { initDb, query, isDbConnected } = require('./db');
const {
  generateToken,
  verifyGoogleToken,
  findOrCreateUser,
  authenticateToken,
  requireAuth,
  requireAdmin
} = require('./auth');
const { handleAiGenerate, SETTINGS_KEYS } = require('./ai_proxy');
const materialQuota = require('./material_quota');
const quotaOwner = req => materialQuota.ownerFor(req.user, req.get('X-Guest-Device'));
const publicUser = (user, quota) => ({
  id: user.id, email: user.email, name: user.name, avatar: user.avatar,
  role: user.role, auth_provider: user.auth_provider,
  has_server_ai_access: user.role === 'admin' || quota.materialLimit === null || quota.remaining > 0,
  ai_calls_count: user.ai_calls_count,
  material_limit: quota.materialLimit, materials_used: quota.materialsUsed, quota
});
function quotaError(res, error) {
  const status = [400, 401, 403, 404, 409, 429].includes(error.status) ? error.status : 503;
  return res.status(status).json({ success: false, message: status === 503 ? 'Material quota service unavailable.' : error.message });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());

// Normalize before parsing so parser failures on either API path stay JSON.
app.use((req, res, next) => {
  req.url = req.url.replace(/^\/fast-learning\/api(?=\/|\?|$)/, '/api');
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// تطبيق فحص التوكن العام لجميع الطلبات
app.use(authenticateToken);

// ==========================================
// 1. مسارات المصادقة (Google & Apple Only)
// ==========================================

// تسجيل الدخول بحساب Google
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;
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
    console.error('Google auth error:', err);
    res.status(401).json({ success: false, message: err.message || 'فشل تسجيل الدخول بحساب Google' });
  }
});

// تسجيل الدخول بحساب Apple (معطل مؤقتاً حتى اكتمال التوثيق الآمن في المرحلة الثانية)
app.post('/api/auth/apple', async (req, res) => {
  return res.status(501).json({
    success: false,
    message: 'Apple sign-in is disabled until full cryptographic verification is configured.'
  });
});

// تسجيل دخول سريع للمطورين والبيئة التجريبية (Dev/Demo Login) - فقط في بيئة development
if (process.env.NODE_ENV === 'development') {
  app.post('/api/auth/dev-login', async (req, res) => {
    try {
      const { email, name, role } = req.body;
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
      console.error('Dev login error:', err);
      res.status(500).json({ success: false, message: err.message || 'فشل تسجيل الدخول التجريبي' });
    }
  });
} else {
  app.post('/api/auth/dev-login', (req, res) => {
    res.status(404).json({ success: false, message: 'Not found' });
  });
}

// استعلام بيانات الحساب الحالي (Me)
app.get('/api/auth/me', async (req, res) => {
  if (!req.user) return res.json({ authenticated: false, user: null });
  try {
    const quota = await materialQuota.read(quotaOwner(req));
    res.json({ authenticated: true, user: publicUser(req.user, quota) });
  } catch (error) { quotaError(res, error); }
});

// ==========================================
// 2. وسيط الذكاء الاصطناعي (AI Proxy & Quota)
// ==========================================

// Preserve guests with the same paid-endpoint limit as signed-in users.
// Express's default trust proxy=false deliberately ignores spoofable forwarded IPs.
// Behind a reverse proxy this conservatively shares quota until trusted hops are configured.
const aiRateWindows = new Map();
const AI_WINDOW_MS = 60000;
const AI_REQUEST_LIMIT = 20;
function limitAiRequests(req, res, next) {
  const now = Date.now();
  for (const [ip, bucket] of aiRateWindows) {
    if (bucket.resetAt <= now) aiRateWindows.delete(ip);
  }
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  let bucket = aiRateWindows.get(ip);
  if (!bucket) {
    // Bound memory even under a large number of distinct addresses.
    if (aiRateWindows.size >= 10000) {
      return res.status(429).json({ success: false, message: 'الخدمة مشغولة، حاول لاحقاً.' });
    }
    bucket = { count: 0, resetAt: now + AI_WINDOW_MS };
    aiRateWindows.set(ip, bucket);
  }
  if (++bucket.count > AI_REQUEST_LIMIT) {
    res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    return res.status(429).json({ success: false, message: 'تم تجاوز حد الطلبات، حاول بعد دقيقة.' });
  }
  next();
}

// توليد المحتوى أو الاختبارات أو تقييم الإجابات
app.post('/api/ai/generate', limitAiRequests, async (req, res) => {
  // JSON whitespace keeps idle reverse proxies alive without changing the client
  // contract: response.json() waits for the final object. After a heartbeat, errors
  // use success:false because the HTTP status has already been sent.
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
  const startedAt = Date.now();
  try {
    const result = await handleAiGenerate(req.user, req.body, { guestDevice: req.get('X-Guest-Device') });
    reply(200, result);
  } catch (err) {
    const status = [400, 401, 403, 404, 409, 429, 502, 503, 504].includes(err.status) ? err.status : 500;
    console.warn('AI request failed', { status, operation: req.body?.operation, elapsedMs: Date.now() - startedAt });
    reply(status, {
      success: false,
      message: status === 500 ? 'حدث خطأ أثناء معالجة طلب الذكاء الاصطناعي' : err.message
    });
  }
});

// Durable material allowance and owner-bound generation lifecycle.
app.get('/api/material-quota', async (req, res) => {
  try { res.json({ success: true, quota: await materialQuota.read(quotaOwner(req)) }); }
  catch (error) { quotaError(res, error); }
});
app.post('/api/material-generations/start', limitAiRequests, async (req, res) => {
  try { res.json(await materialQuota.start(quotaOwner(req))); }
  catch (error) { quotaError(res, error); }
});
app.post('/api/material-generations/:id/complete', async (req, res) => {
  try { res.json(await materialQuota.complete(quotaOwner(req), req.params.id, req.body)); }
  catch (error) { quotaError(res, error); }
});
app.delete('/api/material-generations/:id', async (req, res) => {
  try { res.json(await materialQuota.cancel(quotaOwner(req), req.params.id)); }
  catch (error) { quotaError(res, error); }
});

// ==========================================
// 3. إدارة المواد الدراسية (Materials)
// ==========================================

// جلب قائمة المواد المحفوظة للمستخدم
app.get('/api/materials', requireAuth, async (req, res) => {
  try {
    const sql = `
      SELECT m.id, m.title, m.content_preview, m.source_filename, m.total_questions, m.created_at, m.updated_at,
             p.mode as last_mode, p.current_index, p.score, p.is_completed, p.updated_at as last_played_at
      FROM materials m
      LEFT JOIN user_progress p ON p.material_id = m.id AND p.user_id = m.user_id
      WHERE m.user_id = ?
      ORDER BY m.updated_at DESC
    `;
    const rows = await query(sql, [req.user.id]);
    res.json({ success: true, materials: rows });
  } catch (err) {
    console.error('Fetch materials error:', err);
    res.status(500).json({ success: false, message: 'تعذر جلب المواد المحفوظة: ' + err.message });
  }
});

// حفظ مادة دراسية وأسئلتها المولدة
app.post('/api/materials', requireAuth, async (req, res) => {
  // Compatibility alias: never permit an unreserved direct insert.
  try { res.json(await materialQuota.complete(quotaOwner(req), req.body?.generationId, req.body)); }
  catch (error) { quotaError(res, error); }
});

// جلب مادة محددة بكامل أسئلتها للاستئناف أو المراجعة
app.get('/api/materials/:id', requireAuth, async (req, res) => {
  try {
    const materialId = parseInt(req.params.id, 10);
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
    } catch (e) {
      material.questions = [];
    }
    delete material.questions_json;

    res.json({ success: true, material });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// حذف مادة
app.delete('/api/materials/:id', requireAuth, async (req, res) => {
  try {
    const materialId = parseInt(req.params.id, 10);
    await query('DELETE FROM materials WHERE id = ? AND user_id = ?', [materialId, req.user.id]);
    await query('DELETE FROM user_progress WHERE material_id = ? AND user_id = ?', [materialId, req.user.id]);
    res.json({ success: true, message: 'تم حذف المادة بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 4. حفظ واستئناف تقدم الاختبار (Progress & Resume)
// ==========================================

// جلب تقدم الاختبار لمادة معينة
app.get('/api/progress/:materialId', requireAuth, async (req, res) => {
  try {
    const materialId = parseInt(req.params.materialId, 10);
    const mode = req.query.mode || 'speed';

    const rows = await query(
      'SELECT * FROM user_progress WHERE user_id = ? AND material_id = ? AND mode = ?',
      [req.user.id, materialId, mode]
    );

    if (rows.length === 0) {
      return res.json({ success: true, progress: null });
    }

    const progress = rows[0];
    if (progress.state_json) {
      try {
        progress.state = JSON.parse(progress.state_json);
      } catch (e) {
        progress.state = null;
      }
    }

    res.json({ success: true, progress });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// حفظ أو تحديث تقدم الاختبار لحظياً
app.post('/api/progress', requireAuth, async (req, res) => {
  try {
    const {
      materialId,
      mode = 'speed',
      currentIndex = 0,
      score = 0,
      totalQuestions = 0,
      correctCount = 0,
      wrongCount = 0,
      state,
      isCompleted = 0
    } = req.body;

    if (!materialId) {
      return res.status(400).json({ success: false, message: 'معرّف المادة (materialId) مطلوب' });
    }

    const stateJson = typeof state === 'string' ? state : JSON.stringify(state || {});

    await query(
      `INSERT INTO user_progress 
        (user_id, material_id, mode, current_index, score, total_questions, correct_count, wrong_count, state_json, is_completed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
        current_index = VALUES(current_index),
        score = VALUES(score),
        total_questions = VALUES(total_questions),
        correct_count = VALUES(correct_count),
        wrong_count = VALUES(wrong_count),
        state_json = VALUES(state_json),
        is_completed = VALUES(is_completed),
        updated_at = NOW()`,
      [req.user.id, materialId, mode, currentIndex, score, totalQuestions, correctCount, wrongCount, stateJson, isCompleted ? 1 : 0]
    );

    res.json({ success: true, message: 'تم حفظ التقدم بنجاح' });
  } catch (err) {
    console.error('Save progress error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// إعادة تعيين التقدم لمادة معينة
app.delete('/api/progress/:materialId', requireAuth, async (req, res) => {
  try {
    const materialId = parseInt(req.params.materialId, 10);
    const mode = req.query.mode;
    if (mode) {
      await query('DELETE FROM user_progress WHERE user_id = ? AND material_id = ? AND mode = ?', [req.user.id, materialId, mode]);
    } else {
      await query('DELETE FROM user_progress WHERE user_id = ? AND material_id = ?', [req.user.id, materialId]);
    }
    res.json({ success: true, message: 'تمت إعادة تعيين التقدم' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 5. إعدادات المستخدم الشخصية (User Settings)
// ==========================================

// User settings accept display names only, never personal credentials.
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
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 6. لوحة تحكم المشرف الشاملة (Admin Dashboard)
// ==========================================

// إحصائيات عامة للمشرف
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

    res.json({
      success: true,
      stats: {
        totalUsers: userStats.total_users || 0,
        activeAiUsers: userStats.active_ai_users || 0,
        totalAiCalls: userStats.total_ai_calls || 0,
        totalMaterials: materialStats.total_materials || 0,
        totalQuizSessions: quizStats.total_quiz_sessions || 0,
        completedQuizzes: quizStats.completed_quizzes || 0,
        dbConnected: isDbConnected()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// جلب قائمة كافة المستخدمين
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const search = req.query.search ? `%${req.query.search.trim()}%` : null;
    let sql = `
      SELECT u.id, u.email, u.name, u.avatar, u.auth_provider, u.role, 
             (u.role = 'admin' OR q.material_limit IS NULL OR q.materials_used < q.material_limit) AS has_server_ai_access,
             CASE WHEN u.role = 'admin' THEN NULL ELSE q.material_limit END AS material_limit,
             q.materials_used, u.ai_calls_count, u.last_login, u.created_at,
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
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/users/:id/material-quota', requireAdmin, async (req, res) => {
  try { res.json(await materialQuota.setLimit(req.params.id, req.body?.materialLimit)); }
  catch (error) { quotaError(res, error); }
});

// Legacy binary grants no longer govern access; clients must set a material limit.
app.post('/api/admin/users/:id/toggle-ai', requireAdmin, (req, res) => {
  res.status(410).json({ success: false, message: 'Binary AI grants were replaced. Use POST /api/admin/users/:id/material-quota.' });
});

// ترقية المستخدم أو تغيير رتبته
app.post('/api/admin/users/:id/toggle-role', requireAdmin, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    if (targetUserId === req.user.id) {
      return res.status(400).json({ success: false, message: 'لا يمكنك تغيير رتبة حسابك الحالي' });
    }

    const { role } = req.body;
    const targetRole = role === 'admin' ? 'admin' : 'user';

    await query('UPDATE users SET role = ?, has_server_ai_access = IF(? = "admin", 1, has_server_ai_access) WHERE id = ?', [
      targetRole, targetRole, targetUserId
    ]);

    res.json({ success: true, message: `تم تحديث رتبة المستخدم إلى ${targetRole}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// حذف مستخدم
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    if (targetUserId === req.user.id) {
      return res.status(400).json({ success: false, message: 'لا يمكنك حذف حسابك الحالي' });
    }

    await query('DELETE FROM users WHERE id = ?', [targetUserId]);
    res.json({ success: true, message: 'تم حذف المستخدم وجميع بياناته بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// جلب إعدادات ومفاتيح الذكاء الاصطناعي للمشرف
app.get('/api/admin/ai-settings', requireAdmin, async (req, res) => {
  try {
    const rows = await query(
      `SELECT setting_key, setting_value FROM admin_settings WHERE setting_key IN (${SETTINGS_KEYS.map(() => '?').join(',')})`,
      SETTINGS_KEYS
    );
    const settings = {};
    for (const row of rows) {
      settings[row.setting_key] = row.setting_value;
    }
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// حفظ وتحديث إعدادات ومفاتيح الذكاء الاصطناعي في قاعدة البيانات
app.post('/api/admin/ai-settings', requireAdmin, async (req, res) => {
  try {
    const { settings } = req.body || {};
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: 'بيانات الإعدادات غير صالحة' });
    }

    for (const key of SETTINGS_KEYS) {
      if (settings[key] !== undefined) {
        const val = typeof settings[key] === 'object' ? JSON.stringify(settings[key]) : String(settings[key] || '');
        await query(
          'INSERT INTO admin_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()',
          [key, val]
        );
      }
    }

    res.json({ success: true, message: 'تم حفظ وتحديث إعدادات الذكاء الاصطناعي بنجاح في قاعدة البيانات ✅' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// فحص اتصال الذكاء الاصطناعي فوري للمشرف
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
        payload: {
          contents: [{ role: 'user', parts: [{ text: 'مرحباً، تم فحص الصوت بنجاح.' }] }]
        }
      }, { adminTest: true });
      const latency = Date.now() - start;
      const hasAudio = Boolean(result?.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data);
      return res.json({ success: true, latency, hasAudio });
    }
    res.status(400).json({ success: false, message: 'نوع الاختبار غير صالح' });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      message: err.message || 'فشل الاتصال بمزود الذكاء الاصطناعي',
      latency: Date.now() - start
    });
  }
});

// ==========================================
// 7. الإعدادات العامة للواجهة (Public Config)
// ==========================================

app.get('/api/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    appleClientId: process.env.APPLE_CLIENT_ID || '',
    dbConnected: isDbConnected(),
    allowDevLogin: process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_LOGIN === 'true'
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
  const message = status === 413 ? 'حجم المرفقات كبير جداً. قلّل حجم الملفات أو عددها ثم حاول مرة أخرى.'
    : status === 400 ? 'بيانات الطلب غير صالحة. أعد المحاولة.'
    : 'حدث خطأ في خادم التطبيق. حاول مرة أخرى لاحقاً.';
  res.status(status).json({ success: false, message });
});

// ==========================================
// 8. تقديم الملفات الثابتة والواجهة (Static Files)
// ==========================================

// Serve only the original app HTML; never expose server files or secrets.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path === '/api' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ==========================================
// تشغيل الخادم
// ==========================================

async function startServer() {
  // تهيئة قاعدة البيانات وإنشاء الجداول
  await initDb();

  app.listen(PORT, () => {
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
      } catch (e) {}
    }
  });
}

if (require.main === module) {
  startServer().catch(() => {
    console.error('Server startup failed.');
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
