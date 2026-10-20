'use strict';
// Explicit maintenance command. Merely importing this module never connects.
async function main() {
  const { getPool } = require('../db');
  const { runMigrations } = require('./migrations');
  const pool = getPool();
  try { await runMigrations(pool); }
  finally { await pool.end(); }
}
if (require.main === module) main().catch(() => { console.error('Migration failed. Check reviewed database configuration and migration state.'); process.exitCode = 1; });
module.exports = { main };
