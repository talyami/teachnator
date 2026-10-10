import fs from 'fs';
import path from 'path';
import { query, transaction } from './pool.js';

export async function runMigrations(): Promise<void> {
  console.log('🔄 Checking database migrations...');

  // Ensure migrations tracking table exists
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     VARCHAR(100) PRIMARY KEY,
      applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  const appliedRows = await query<Array<{ version: string }>>(
    'SELECT version FROM schema_migrations'
  );
  const applied = new Set(appliedRows.map(r => r.version));

  let migrationsDir = path.resolve(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    const srcMigrations = path.resolve(__dirname, '../../src/db/migrations');
    if (fs.existsSync(srcMigrations)) {
      migrationsDir = srcMigrations;
    } else {
      console.warn(`Migrations directory not found at: ${migrationsDir} or ${srcMigrations}`);
      return;
    }
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    console.log(`📦 Applying migration: ${file}...`);
    const filePath = path.join(migrationsDir, file);
    const sqlContent = fs.readFileSync(filePath, 'utf8');

    // Split statements safely
    const statements = sqlContent
      .split(/;\s*[\r\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    await transaction(async (conn) => {
      for (const statement of statements) {
        if (statement.length > 0) {
          await conn.query(statement);
        }
      }
      await conn.query(
        'INSERT INTO schema_migrations (version) VALUES (?)',
        [file]
      );
    });

    console.log(`✅ Applied migration: ${file}`);
  }

  console.log('✨ All migrations are up to date.');
}

// Allow direct execution
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
