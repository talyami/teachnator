const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// إعدادات الاتصال بقاعدة بيانات MySQL
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fast_learning_db',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
};

let pool = null;
let isDbConnected = false;

// تهيئة الاتصال بالقاعدة
function getPool() {
  if (!pool) {
    try {
      pool = mysql.createPool(dbConfig);
    } catch (err) {
      console.error('❌ خطأ في إنشاء مجمع اتصالات MySQL:', err.message);
    }
  }
  return pool;
}

// إنشاء الجداول تلقائياً إن لم تكن موجودة
async function initDb() {
  try {
    const p = getPool();
    if (!p) return false;

    // فحص الاتصال
    const connection = await p.getConnection();
    connection.release();
    isDbConnected = true;
    console.log('✅ تم الاتصال بقاعدة بيانات MySQL بنجاح!');

    // جدول المستخدمين
    await p.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) DEFAULT '',
        avatar TEXT,
        auth_provider VARCHAR(50) DEFAULT 'google',
        provider_id VARCHAR(255) DEFAULT '',
        role VARCHAR(50) DEFAULT 'user',
        has_server_ai_access TINYINT(1) DEFAULT 0,
        ai_calls_count INT DEFAULT 0,
        last_login DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // جدول المواد الدراسية / الاختبارات
    await p.query(`
      CREATE TABLE IF NOT EXISTS materials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        content_preview TEXT,
        source_filename VARCHAR(255) DEFAULT '',
        questions_json LONGTEXT NOT NULL,
        total_questions INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // جدول تقدم المستخدم وإمكانية الاستئناف
    await p.query(`
      CREATE TABLE IF NOT EXISTS user_progress (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        material_id INT NOT NULL,
        mode VARCHAR(50) DEFAULT 'speed',
        current_index INT DEFAULT 0,
        score INT DEFAULT 0,
        total_questions INT DEFAULT 0,
        correct_count INT DEFAULT 0,
        wrong_count INT DEFAULT 0,
        state_json LONGTEXT,
        is_completed TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_user_material_mode (user_id, material_id, mode),
        INDEX idx_user_progress (user_id, material_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // جدول إعدادات المشرف ومفاتيح السيرفر العامة
    await p.query(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value LONGTEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // A separate durable lifetime ledger survives material deletion. INSERT IGNORE
    // migrates historical usage exactly once, including databases restarted later.
    await p.query(`CREATE TABLE IF NOT EXISTS material_quota_accounts (
      owner_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      material_limit INT UNSIGNED NULL DEFAULT 1,
      materials_used INT UNSIGNED NOT NULL DEFAULT 0,
      pending_generation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL
    ) ENGINE=InnoDB`);
    await p.query(`CREATE TABLE IF NOT EXISTS material_generations (
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      owner_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      user_id INT NULL,
      state VARCHAR(16) NOT NULL DEFAULT 'pending',
      draft_state VARCHAR(16) NOT NULL DEFAULT 'idle',
      revise_state VARCHAR(16) NOT NULL DEFAULT 'idle',
      charged TINYINT(1) NOT NULL DEFAULT 0,
      material_id INT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_generation_owner (owner_key)
    ) ENGINE=InnoDB`);
    await p.query(`INSERT IGNORE INTO material_quota_accounts (owner_key, materials_used)
      SELECT CONCAT('user:', u.id), COUNT(m.id) FROM users u
      LEFT JOIN materials m ON m.user_id = u.id GROUP BY u.id`);

    // Environment values bootstrap missing rows only. Subsequent changes belong in MySQL.
    const defaults = {
      server_brain_url: process.env.SERVER_BRAIN_URL || 'https://srv875806.tail759794.ts.net:10000/v1',
      server_brain_api_key: process.env.SERVER_BRAIN_API_KEY || '',
      server_brain_model: process.env.SERVER_BRAIN_MODEL || 'combo-gemini-flash',
      server_gemini_api_key: process.env.SERVER_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '',
      server_vertex_config: JSON.stringify({
        project: process.env.VERTEX_PROJECT_ID || '',
        region: process.env.VERTEX_REGION || 'global',
        key: process.env.VERTEX_KEY_TOKEN || ''
      }),
      server_tts_provider: process.env.SERVER_TTS_PROVIDER || 'gemini',
      server_tts_model: process.env.SERVER_TTS_MODEL || 'gemini-2.5-flash-preview-tts',
      server_tts_voice: process.env.SERVER_TTS_VOICE || 'Aoede',
      app_version: process.env.APP_VERSION || '1.2.0',
      app_build_hash: process.env.APP_BUILD_HASH || '20261012-v120',
      app_force_reload: process.env.APP_FORCE_RELOAD || '0'
    };
    for (const [key, value] of Object.entries(defaults)) {
      await p.query(
        'INSERT INTO admin_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key)',
        [key, value]
      );
    }

    console.log('✅ تم فحص وإنشاء جداول قاعدة البيانات بنجاح (users, materials, user_progress, admin_settings).');
    return true;
  } catch (err) {
    isDbConnected = false;
    console.warn('⚠️ تعذر الاتصال بـ MySQL مباشرة:', err.message);
    console.warn('💡 تأكد من ملء بيانات DB_HOST, DB_USER, DB_PASSWORD, DB_NAME في ملف .env');
    return false;
  }
}

// دالة تنفيذ الاستعلامات بأمان
async function query(sql, params = []) {
  const p = getPool();
  if (!p || !isDbConnected) {
    throw new Error('قاعدة البيانات غير متصلة حالياً. يرجى التحقق من إعدادات MySQL في ملف .env');
  }
  const [rows] = await p.query(sql, params);
  return rows;
}

// All statements in a quota mutation use one connection and one transaction.
async function transaction(work) {
  if (!isDbConnected) throw new Error('Database unavailable.');
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const txQuery = async (sql, params = []) => {
      const [rows] = await connection.query(sql, params);
      return rows;
    };
    const result = await work(txQuery);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// استرجاع إصدار التطبيق من قاعدة البيانات (مع التراجع الآمن في حال عدم الاتصال)
const DEFAULT_APP_VERSION = '1.2.0';
const DEFAULT_APP_BUILD = '20261012-v120';

async function getAppVersion() {
  if (isDbConnected) {
    try {
      const rows = await query(
        "SELECT setting_key, setting_value, updated_at FROM admin_settings WHERE setting_key IN ('app_version', 'app_build_hash', 'app_force_reload')"
      );
      const settings = {};
      let updatedAt = null;
      for (const r of rows) {
        settings[r.setting_key] = r.setting_value;
        if (r.updated_at) updatedAt = r.updated_at;
      }
      return {
        version: settings.app_version || DEFAULT_APP_VERSION,
        build: settings.app_build_hash || DEFAULT_APP_BUILD,
        forceReload: settings.app_force_reload === '1' || settings.app_force_reload === 'true',
        updatedAt: updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString()
      };
    } catch (e) {
      console.warn('⚠️ تعذر قراءة إصدار التطبيق من MySQL، سيتم استخدام القيمة الافتراضية:', e.message);
    }
  }
  return {
    version: process.env.APP_VERSION || DEFAULT_APP_VERSION,
    build: process.env.APP_BUILD_HASH || DEFAULT_APP_BUILD,
    forceReload: process.env.APP_FORCE_RELOAD === '1' || process.env.APP_FORCE_RELOAD === 'true',
    updatedAt: new Date().toISOString()
  };
}

async function setAppVersion({ version, build, forceReload } = {}) {
  const current = await getAppVersion();
  const newVersion = version ? String(version).trim() : current.version;
  const newBuild = build ? String(build).trim() : Date.now().toString();
  const newForceReload = forceReload !== undefined ? (forceReload ? '1' : '0') : (current.forceReload ? '1' : '0');

  const p = getPool();
  if (p && isDbConnected) {
    await p.query(
      `INSERT INTO admin_settings (setting_key, setting_value) VALUES 
       ('app_version', ?), ('app_build_hash', ?), ('app_force_reload', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()`,
      [newVersion, newBuild, newForceReload]
    );
  }
  return {
    version: newVersion,
    build: newBuild,
    forceReload: newForceReload === '1',
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  transaction,
  getPool,
  initDb,
  query,
  isDbConnected: () => isDbConnected,
  dbConfig,
  getAppVersion,
  setAppVersion,
  DEFAULT_APP_VERSION,
  DEFAULT_APP_BUILD
};
