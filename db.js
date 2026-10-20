'use strict';
const path = require('node:path');
const mysql = require('mysql2/promise');
const { runMigrations } = require('./scripts/migrations');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

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
let connected = false;
const { version: DEFAULT_APP_VERSION, build: DEFAULT_APP_BUILD } = require('./release.cjs');

function getPool() {
  if (!pool) pool = mysql.createPool(dbConfig);
  return pool;
}

async function initDb() {
  connected = false;
  try {
    const p = getPool();
    if (process.env.DB_AUTO_MIGRATE !== 'false') await runMigrations(p);
    else {
      const [rows] = await p.query('SELECT version FROM schema_migrations ORDER BY version');
      const { migrations } = require('./scripts/migrations');
      const versions = new Set(rows.map(row => row.version));
      if (migrations.some(migration => !versions.has(migration.version))) throw new Error('Pending database migrations. Run npm run db:migrate before startup.');
    }
    // Environment values bootstrap missing rows only, never overwrite admin edits.
    const defaults = {
      server_brain_url: process.env.SERVER_BRAIN_URL || '',
      server_brain_api_key: process.env.SERVER_BRAIN_API_KEY || '',
      server_brain_model: process.env.SERVER_BRAIN_MODEL || 'gemini-2.5-flash',
      server_gemini_api_key: process.env.SERVER_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '',
      server_vertex_config: JSON.stringify({ project: process.env.VERTEX_PROJECT_ID || '', region: process.env.VERTEX_REGION || 'global', key: process.env.VERTEX_KEY_TOKEN || '' }),
      server_tts_provider: process.env.SERVER_TTS_PROVIDER || 'gemini',
      server_tts_model: process.env.SERVER_TTS_MODEL || 'gemini-2.5-flash-preview-tts',
      server_tts_voice: process.env.SERVER_TTS_VOICE || 'Aoede',
      app_version: process.env.APP_VERSION || DEFAULT_APP_VERSION,
      app_build_hash: process.env.APP_BUILD_HASH || DEFAULT_APP_BUILD,
      app_force_reload: process.env.APP_FORCE_RELOAD || '0'
    };
    for (const [key, value] of Object.entries(defaults)) {
      await p.query('INSERT INTO admin_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key)', [key, value]);
    }
    connected = true;
    console.info('Database ready; migrations verified.');
    return true;
  } catch (error) {
    console.warn(JSON.stringify({ source: 'database', code: 'DATABASE_INIT_FAILED', status: 503 }));
    return false;
  }
}
async function query(sql, params = []) {
  if (!connected) throw new Error('Database unavailable.');
  const [rows] = await getPool().query(sql, params);
  return rows;
}
async function transaction(work) {
  if (!connected) throw new Error('Database unavailable.');
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const txQuery = async (sql, params = []) => (await connection.query(sql, params))[0];
    const result = await work(txQuery);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
async function getAppVersion() {
  if (connected) {
    try {
      const rows = await query("SELECT setting_key, setting_value, updated_at FROM admin_settings WHERE setting_key IN ('app_version', 'app_build_hash', 'app_force_reload')");
      const settings = Object.fromEntries(rows.map(row => [row.setting_key, row.setting_value]));
      const updatedAt = rows.reduce((latest, row) => row.updated_at && (!latest || row.updated_at > latest) ? row.updated_at : latest, null);
      return { version: settings.app_version || DEFAULT_APP_VERSION, build: settings.app_build_hash || DEFAULT_APP_BUILD,
        forceReload: ['1', 'true'].includes(settings.app_force_reload), updatedAt: updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString() };
    } catch (_) { console.warn(JSON.stringify({ source: 'database', code: 'VERSION_READ_FAILED', status: 503 })); }
  }
  return { version: process.env.APP_VERSION || DEFAULT_APP_VERSION, build: process.env.APP_BUILD_HASH || DEFAULT_APP_BUILD,
    forceReload: ['1', 'true'].includes(process.env.APP_FORCE_RELOAD), updatedAt: new Date().toISOString() };
}
async function setAppVersion({ version, build, forceReload } = {}) {
  const current = await getAppVersion();
  const newVersion = version ? String(version).trim() : current.version;
  const newBuild = build ? String(build).trim() : Date.now().toString();
  const newForceReload = forceReload !== undefined ? (forceReload ? '1' : '0') : (current.forceReload ? '1' : '0');
  if (connected) await getPool().query(`INSERT INTO admin_settings (setting_key, setting_value) VALUES
    ('app_version', ?), ('app_build_hash', ?), ('app_force_reload', ?)
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()`, [newVersion, newBuild, newForceReload]);
  return { version: newVersion, build: newBuild, forceReload: newForceReload === '1', updatedAt: new Date().toISOString() };
}
module.exports = { transaction, getPool, initDb, query, isDbConnected: () => connected, dbConfig, getAppVersion, setAppVersion, DEFAULT_APP_VERSION, DEFAULT_APP_BUILD };
