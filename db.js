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
      server_tts_voice: process.env.SERVER_TTS_VOICE || 'Aoede'
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

module.exports = {
  getPool,
  initDb,
  query,
  isDbConnected: () => isDbConnected,
  dbConfig
};
