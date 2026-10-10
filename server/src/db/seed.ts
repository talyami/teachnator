import { config } from '../config.js';
import { query, transaction } from './pool.js';
import { runMigrations } from './migrate.js';
import { encryptApiKey, sha256, generateRandomToken } from '../lib/crypto.js';

export async function runSeed(): Promise<void> {
  if (config.NODE_ENV !== 'development') {
    console.error('❌ Refusing to seed: NODE_ENV must be "development"');
    process.exit(1);
  }

  console.log('🌱 Starting development seed...');
  await runMigrations();

  // 1. Seed Default Server API Key if provided in .env
  if (config.SERVER_GEMINI_API_KEY) {
    const encryptedKey = encryptApiKey(config.SERVER_GEMINI_API_KEY, config.KEY_ENCRYPTION_SECRET);
    const existingKeys = await query<any[]>('SELECT id FROM api_keys WHERE is_default = 1 LIMIT 1');
    if (existingKeys.length === 0) {
      await query(
        `INSERT INTO api_keys (label, key_value, provider, is_default) VALUES (?, ?, ?, 1)`,
        ['Default Shared Gemini Pool', encryptedKey, 'gemini']
      );
      console.log('🔑 Seeded default Gemini API Key from .env');
    }
  }

  // 2. Seed Test Users
  const seedUsers = [
    {
      email: 'admin@local.test',
      name: 'المشرف العام (تجريبي)',
      role: 'admin',
      plan: 'unlimited',
      provider: 'google',
      sub: 'google_dev_admin_123'
    },
    {
      email: 'student@local.test',
      name: 'طالب مجتهد (تجريبي)',
      role: 'user',
      plan: 'free',
      provider: 'google',
      sub: 'google_dev_student_456'
    }
  ];

  console.log('\n================== SEEDED DEV SESSIONS ==================');

  for (const u of seedUsers) {
    let userId: number;
    const existing = await query<any[]>('SELECT id FROM users WHERE email = ?', [u.email]);
    if (existing.length > 0) {
      userId = existing[0].id;
      await query(
        'UPDATE users SET name = ?, role = ?, plan = ?, status = "active", email_verified = 1 WHERE id = ?',
        [u.name, u.role, u.plan, userId]
      );
    } else {
      const res = await query<any>(
        `INSERT INTO users (email, email_verified, name, role, plan, status)
         VALUES (?, 1, ?, ?, ?, 'active')`,
        [u.email, u.name, u.role, u.plan]
      );
      userId = res.insertId;
    }

    // Link provider identity
    await query(
      `INSERT INTO auth_identities (user_id, provider, provider_subject, provider_email)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE provider_email = VALUES(provider_email)`,
      [userId, u.provider, u.sub, u.email]
    );

    // Create 30-day active session token
    const rawSessionToken = generateRandomToken(32);
    const sessionHash = sha256(rawSessionToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');

    await query(
      `INSERT INTO sessions (id_hash, user_id, expires_at, ip, user_agent)
       VALUES (?, ?, ?, '127.0.0.1', 'Seed Script')`,
      [sessionHash, userId, expiresAt]
    );

    console.log(`👤 User: ${u.email} (${u.role.toUpperCase()})`);
    console.log(`   Session Token: ${rawSessionToken}`);
    console.log(`   Dev Direct URL: http://localhost:5173/fast-learning/?dev_token=${rawSessionToken}`);
    console.log('---------------------------------------------------------');
  }

  console.log('✅ Seeding completed successfully.\n');
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
