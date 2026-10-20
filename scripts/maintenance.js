'use strict';
const { getRetentionPolicy } = require('../retention_policy');

// Injected adapter makes this cleanup-only: no app init, migrations or default inserts.
async function maintain(database, { env = process.env, dryRun = false } = {}) {
  const policy = getRetentionPolicy(env);
  const predicates = [
    ['tts_cache', 'created_at < (UTC_TIMESTAMP() - INTERVAL ? DAY)', policy.ttsCacheDays],
    ['ai_daily_budgets', 'usage_day < (UTC_DATE() - INTERVAL ? DAY)', policy.dailyBudgetDays],
    ['ai_usage', 'created_at < (UTC_TIMESTAMP() - INTERVAL ? DAY)', policy.aiUsageDays]
  ];
  const counts = {};
  for (const [table, where, days] of predicates) {
    const [rows] = await database.query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, [days]);
    counts[table] = Number(rows[0]?.count) || 0;
    if (!dryRun) await database.query(`DELETE FROM ${table} WHERE ${where}`, [days]);
  }
  const [expired] = await database.query("SELECT COUNT(*) AS count FROM material_generations WHERE state = 'pending' AND expires_at <= UTC_TIMESTAMP()");
  counts.expiredReservations = Number(expired[0]?.count) || 0;
  if (!dryRun) {
    await database.query("UPDATE material_generations SET state = 'expired' WHERE state = 'pending' AND expires_at <= UTC_TIMESTAMP()");
    await database.query("UPDATE material_quota_accounts a LEFT JOIN material_generations g ON g.id = a.pending_generation_id SET a.pending_generation_id = NULL WHERE a.pending_generation_id IS NOT NULL AND (g.id IS NULL OR g.state <> 'pending')");
  }
  return { dryRun, counts, policy };
}
async function main({ env = process.env, createPool } = {}) {
  const pool = (createPool || require('mysql2/promise').createPool)({ host: env.DB_HOST || '127.0.0.1', port: Number(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, connectionLimit: 1 });
  try {
    const result = await maintain(pool, { env, dryRun: process.argv.includes('--dry-run') });
    console.info(JSON.stringify({ code: 'MAINTENANCE_COMPLETED', dryRun: result.dryRun, counts: result.counts }));
    return result;
  } finally { await pool.end(); }
}
if (require.main === module) {
  require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env'), quiet: true });
  main().catch(() => { console.error('MAINTENANCE_FAILED'); process.exitCode = 1; });
}
module.exports = { main, maintain };
