'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

async function ensureColumn(connection, table, column, definition) {
  // Identifiers/definitions are constants from reviewed migrations, never request input.
  const [rows] = await connection.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, column]);
  if (!rows.length) await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

async function ensureIndex(connection, table, index, columns) {
  const [rows] = await connection.query('SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?', [table, index]);
  if (!rows.length) await connection.query(`ALTER TABLE \`${table}\` ADD INDEX \`${index}\` (${columns.map(column => `\`${column}\``).join(', ')})`);
}

const migrations = [
  { version: '001', name: 'baseline', async up(connection) {
    // schema.sql is the frozen baseline. All future changes must be new migrations.
    const sql = await fs.readFile(path.join(__dirname, '..', 'schema.sql'), 'utf8');
    const statements = sql.replace(/^\s*--.*$/gm, '').split(';').map(sql => sql.trim()).filter(Boolean);
    for (const statement of statements) {
      // Select/create the database out-of-band, never inside an application migration.
      if (/^(CREATE\s+DATABASE|USE)\b/i.test(statement)) continue;
      await connection.query(statement);
    }
    await connection.query(`INSERT IGNORE INTO material_quota_accounts (owner_key, materials_used)
      SELECT CONCAT('user:', u.id), COUNT(m.id) FROM users u
      LEFT JOIN materials m ON m.user_id = u.id GROUP BY u.id`);
  } },
  { version: '002', name: 'session_and_generation_integrity', async up(connection) {
    await ensureColumn(connection, 'users', 'status', "VARCHAR(20) NOT NULL DEFAULT 'active'");
    await ensureColumn(connection, 'users', 'session_version', 'INT UNSIGNED NOT NULL DEFAULT 0');
    await ensureColumn(connection, 'material_generations', 'source_hash', 'CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL');
  } },
  { version: '003', name: 'atomic_daily_ai_budgets', async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS ai_daily_budgets (
      owner_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      task VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      usage_day DATE NOT NULL,
      requests INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (owner_key, task, usage_day)
    ) ENGINE=InnoDB`);
  } },
  { version: '004', name: 'canonical_generation_and_attributed_usage', async up(connection) {
    await ensureColumn(connection, 'material_generations', 'canonical_questions_json', 'LONGTEXT NULL');
    await ensureColumn(connection, 'ai_usage', 'material_id', 'INT NULL');
    await ensureColumn(connection, 'ai_usage', 'generation_id', 'CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL');
    await ensureIndex(connection, 'ai_usage', 'idx_usage_material', ['material_id', 'created_at']);
    await ensureIndex(connection, 'ai_usage', 'idx_usage_generation', ['generation_id', 'owner_key']);
  } },
  { version: '005', name: 'ordered_progress_saves', async up(connection) {
    await ensureColumn(connection, 'user_progress', 'save_revision', 'BIGINT UNSIGNED NOT NULL DEFAULT 0');
  } }
];

async function runMigrations(pool, { lockTimeout = 30, logger = console } = {}) {
  const connection = await pool.getConnection();
  let locked = false;
  try {
    const [[database]] = await connection.query('SELECT DATABASE() AS name');
    if (!database.name) throw new Error('A database must be selected before migration.');
    const lockName = `fl:migrations:${createHash('sha256').update(database.name).digest('hex').slice(0, 40)}`;
    const [[lock]] = await connection.query('SELECT GET_LOCK(?, ?) AS acquired', [lockName, lockTimeout]);
    if (Number(lock.acquired) !== 1) throw new Error('Could not acquire the database migration advisory lock.');
    locked = lockName;
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const [applied] = await connection.query('SELECT version FROM schema_migrations ORDER BY version');
    const versions = new Set(applied.map(row => row.version));
    for (const migration of migrations) {
      if (versions.has(migration.version)) continue;
      // MySQL DDL implicitly commits. Each migration must be retry-safe; only mark
      // success after every statement. The connection-scoped lock serializes workers.
      await migration.up(connection);
      await connection.query('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [migration.version, migration.name]);
      logger.info(`Applied migration ${migration.version}: ${migration.name}`);
    }
  } finally {
    if (locked) {
      try { await connection.query('SELECT RELEASE_LOCK(?)', [locked]); }
      catch { connection.destroy(); }
    }
    connection.release();
  }
}
module.exports = { migrations, runMigrations, ensureColumn, ensureIndex };
