const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { initDb, query, isDbConnected, dbConfig } = require('./db');
const {
  generateToken,
  verifyGoogleToken,
  parseAppleToken,
  findOrCreateUser,
  authenticateToken,
  requireAuth,
  requireAdmin,
  ADMIN_EMAILS
} = require('./auth');
const { handleAiGenerate, handleFetchModels, getServerAiCredentials } = require('./ai_proxy');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// دعم كلا المسارين (مباشر /api أو عبر المسار الفرعي /fast-learning/api)
app.use((req, res, next) => {
  if (req.url.startsWith('/fast-learning/api')) {
    req.url = req.url.replace('/fast-learning/api', '/api');
  }
  next();
});

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
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        auth_provider: user.auth_provider,
        has_server_ai_access: user.has_server_ai_access,
        ai_calls_count: user.ai_calls_count,
        custom_api_settings: user.custom_api_settings
      }
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
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          role: user.role,
          auth_provider: user.auth_provider,
          has_server_ai_access: user.has_server_ai_access,
          ai_calls_count: user.ai_calls_count,
          custom_api_settings: user.custom_api_settings
        }
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
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        auth_provider: user.auth_provider,
        has_server_ai_access: user.has_server_ai_access,
        ai_calls_count: user.ai_calls_count,
        custom_api_settings: user.custom_api_settings
      }
    });
  } catch (err) {
    console.error('Dev login error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// استعلام بيانات الحساب الحالي (Me)
app.get('/api/auth/me', (req, res) => {
  if (!req.user) {
    return res.json({ authenticated: false, user: null });
  }
  res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      avatar: req.user.avatar,
      role: req.user.role,
      auth_provider: req.user.auth_provider,
      has_server_ai_access: req.user.has_server_ai_access,
      ai_calls_count: req.user.ai_calls_count,
      custom_api_settings: req.user.custom_api_settings
    }
  });
});

// ==========================================
// 2. وسيط الذكاء الاصطناعي (AI Proxy & Quota)
// ==========================================

// توليد المحتوى أو الاختبارات أو تقييم الإجابات
app.post('/api/ai/generate', async (req, res) => {
  try {
    const result = await handleAiGenerate(req.user, req.body);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: err.message || 'حدث خطأ أثناء معالجة طلب الذكاء الاصطناعي',
      details: err.details || null
    });
  }
});

// جلب النماذج المتاحة
app.get('/api/ai/models', async (req, res) => {
  try {
    const apiKey = req.query.key || '';
    const models = await handleFetchModels(req.user, apiKey);
    res.json({ success: true, ...models });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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
  try {
    const { title, contentPreview, sourceFilename, questions, totalQuestions } = req.body;
    if (!title || !questions) {
      return res.status(400).json({ success: false, message: 'عنوان المادة والأسئلة مطلوبان' });
    }

    const questionsJson = typeof questions === 'string' ? questions : JSON.stringify(questions);
    const count = totalQuestions || (Array.isArray(questions) ? questions.length : 0);

    const result = await query(
      `INSERT INTO materials (user_id, title, content_preview, source_filename, questions_json, total_questions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [req.user.id, title, contentPreview || '', sourceFilename || '', questionsJson, count]
    );

    res.json({
      success: true,
      materialId: result.insertId,
      message: 'تم حفظ المادة والأسئلة بنجاح في قاعدة البيانات'
    });
  } catch (err) {
    console.error('Save material error:', err);
    res.status(500).json({ success: false, message: 'تعذر حفظ المادة: ' + err.message });
  }
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

// حفظ إعدادات المستخدم (المفاتيح الشخصية والتفضيلات)
app.post('/api/user/settings', requireAuth, async (req, res) => {
  try {
    const { customApiSettings, name } = req.body;
    const settingsStr = typeof customApiSettings === 'string' ? customApiSettings : JSON.stringify(customApiSettings || {});

    await query(
      'UPDATE users SET custom_api_settings = ?, name = COALESCE(NULLIF(?, ""), name) WHERE id = ?',
      [settingsStr, name || '', req.user.id]
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
             u.has_server_ai_access, u.ai_calls_count, u.last_login, u.created_at,
             COUNT(DISTINCT m.id) as materials_count,
             COUNT(DISTINCT p.id) as progress_count
      FROM users u
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

// منح أو سحب صلاحية استخدام مفتاح الذكاء الاصطناعي للسيرفر
app.post('/api/admin/users/:id/toggle-ai', requireAdmin, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const { hasAccess } = req.body;

    const newStatus = hasAccess !== undefined ? (hasAccess ? 1 : 0) : null;

    let updateSql = 'UPDATE users SET has_server_ai_access = ';
    if (newStatus !== null) {
      updateSql += '? WHERE id = ?';
      await query(updateSql, [newStatus, targetUserId]);
    } else {
      updateSql += 'IF(has_server_ai_access = 1, 0, 1) WHERE id = ?';
      await query(updateSql, [targetUserId]);
    }

    const rows = await query('SELECT id, email, name, has_server_ai_access FROM users WHERE id = ?', [targetUserId]);
    res.json({
      success: true,
      user: rows[0],
      message: `تم ${rows[0]?.has_server_ai_access ? 'منح' : 'إلغاء'} صلاحية الذكاء الاصطناعي للمستخدم بنجاح`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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

// جلب إعدادات المشرف للسيرفر (مفاتيح Gemini & Vertex)
app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const creds = await getServerAiCredentials();
    // إخفاء جزء من المفتاح للأمان
    const maskKey = (k) => {
      if (!k || k.length < 8) return k ? '***' : '';
      return k.substring(0, 4) + '...' + k.substring(k.length - 4);
    };

    res.json({
      success: true,
      settings: {
        provider: creds.provider,
        geminiKeyMasked: maskKey(creds.geminiKey),
        hasGeminiKey: Boolean(creds.geminiKey),
        vertexConfig: {
          project: creds.vertexConfig.project || '',
          region: creds.vertexConfig.region || 'global',
          hasKey: Boolean(creds.vertexConfig.key)
        },
        adminEmails: ADMIN_EMAILS,
        dbHost: dbConfig.host,
        dbName: dbConfig.database,
        dbConnected: isDbConnected()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// تحديث إعدادات مفاتيح السيرفر من لوحة التحكم
app.post('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const { geminiKey, provider, vertexConfig } = req.body;

    if (geminiKey !== undefined && geminiKey.trim()) {
      await query(
        `INSERT INTO admin_settings (setting_key, setting_value, updated_at)
         VALUES ('server_gemini_api_key', ?, NOW())
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()`,
        [geminiKey.trim()]
      );
    }

    if (provider) {
      await query(
        `INSERT INTO admin_settings (setting_key, setting_value, updated_at)
         VALUES ('server_ai_provider', ?, NOW())
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()`,
        [provider]
      );
    }

    if (vertexConfig) {
      const vStr = typeof vertexConfig === 'string' ? vertexConfig : JSON.stringify(vertexConfig);
      await query(
        `INSERT INTO admin_settings (setting_key, setting_value, updated_at)
         VALUES ('server_vertex_config', ?, NOW())
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()`,
        [vStr]
      );
    }

    res.json({ success: true, message: 'تم تحديث إعدادات ومفاتيح السيرفر بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// فحص واختبار مفتاح السيرفر مباشرة
app.post('/api/admin/test-ai', requireAdmin, async (req, res) => {
  try {
    const result = await handleAiGenerate(req.user, {
      modelName: 'gemini-2.5-flash',
      payload: {
        contents: [{ role: 'user', parts: [{ text: 'قل كلمة واحدة فقط: مرحباً' }] }]
      }
    });
    res.json({ success: true, message: 'تم اختبار اتصال الذكاء الاصطناعي بنجاح! الاتصال يعمل بشكل ممتاز.', result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل اختبار اتصال الذكاء الاصطناعي: ' + err.message });
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

// ==========================================
// 8. تقديم الملفات الثابتة والواجهة (Static Files)
// ==========================================

// تقديم الملفات الثابتة من المجلد العام المحمي فقط
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// لأي مسار غير معرّف، تقديم صفحة التطبيق الرئيسية
app.use((req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
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

startServer();
