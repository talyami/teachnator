import { query, transaction } from '../db/pool.js';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { AuthProviderType, User } from '@fast-learning/shared';

interface FindOrCreateParams {
  provider: AuthProviderType;
  providerSubject: string;
  email: string | null;
  name: string;
  avatarUrl: string;
  isPrivateEmail?: boolean;
}

export async function findOrCreateUserFromOAuth(params: FindOrCreateParams): Promise<User> {
  const { provider, providerSubject, email, name, avatarUrl, isPrivateEmail = false } = params;
  const normalizedEmail = email ? email.trim().toLowerCase() : null;

  return await transaction(async (conn) => {
    // 1. Check if this exact provider identity already exists
    const [identityRows] = await conn.query<any[]>(
      `SELECT i.*, u.* FROM auth_identities i
       JOIN users u ON i.user_id = u.id
       WHERE i.provider = ? AND i.provider_subject = ?`,
      [provider, providerSubject]
    );

    if (identityRows.length > 0) {
      const user = identityRows[0];
      // Update last login and optional name/avatar if empty
      const isGoogleAdmin = provider === 'google' && normalizedEmail && config.adminEmails.includes(normalizedEmail);
      let newRole = user.role;
      if (isGoogleAdmin && user.role !== 'admin') {
        newRole = 'admin';
        await conn.query(
          `INSERT INTO admin_audit_log (admin_id, action, target_user_id, details)
           VALUES (?, 'auto_bootstrap_admin', ?, ?)`,
          [user.id, user.id, JSON.stringify({ reason: 'Matched ADMIN_EMAILS on Google sign-in', email: normalizedEmail })]
        );
      }

      await conn.query(
        `UPDATE users SET
           last_login_at = NOW(),
           name = COALESCE(NULLIF(name, ''), ?),
           avatar_url = COALESCE(NULLIF(avatar_url, ''), ?),
           role = ?
         WHERE id = ?`,
        [name || '', avatarUrl || '', newRole, user.id]
      );

      const [updated] = await conn.query<any[]>('SELECT * FROM users WHERE id = ?', [user.id]);
      return updated[0] as User;
    }

    // 2. Check if a user with this email already exists (only for verified non-private emails)
    let existingUserId: number | null = null;
    let existingUser: any = null;

    if (normalizedEmail && !isPrivateEmail) {
      const [userRows] = await conn.query<any[]>(
        'SELECT * FROM users WHERE email = ?',
        [normalizedEmail]
      );
      if (userRows.length > 0) {
        existingUser = userRows[0];
        existingUserId = existingUser.id;
      }
    }

    if (existingUserId) {
      // Link the new provider identity to the existing user
      await conn.query(
        `INSERT INTO auth_identities (user_id, provider, provider_subject, provider_email, is_private_email)
         VALUES (?, ?, ?, ?, ?)`,
        [existingUserId, provider, providerSubject, normalizedEmail, isPrivateEmail ? 1 : 0]
      );

      // Check admin bootstrap
      const isGoogleAdmin = provider === 'google' && normalizedEmail && config.adminEmails.includes(normalizedEmail);
      let newRole = existingUser.role;
      if (isGoogleAdmin && existingUser.role !== 'admin') {
        newRole = 'admin';
        await conn.query(
          `INSERT INTO admin_audit_log (admin_id, action, target_user_id, details)
           VALUES (?, 'auto_bootstrap_admin', ?, ?)`,
          [existingUserId, existingUserId, JSON.stringify({ reason: 'Matched ADMIN_EMAILS on Google link', email: normalizedEmail })]
        );
      }

      await conn.query(
        `UPDATE users SET
           last_login_at = NOW(),
           name = COALESCE(NULLIF(name, ''), ?),
           avatar_url = COALESCE(NULLIF(avatar_url, ''), ?),
           role = ?
         WHERE id = ?`,
        [name || '', avatarUrl || '', newRole, existingUserId]
      );

      const [updated] = await conn.query<any[]>('SELECT * FROM users WHERE id = ?', [existingUserId]);
      return updated[0] as User;
    }

    // 3. Create a brand new user
    const userEmail = normalizedEmail || `apple_${providerSubject}@privaterelay.appleid.com`;
    const isGoogleAdmin = provider === 'google' && normalizedEmail && config.adminEmails.includes(normalizedEmail);
    const initialRole = isGoogleAdmin ? 'admin' : 'user';

    const [insertUserRes] = await conn.query<any>(
      `INSERT INTO users (email, email_verified, name, avatar_url, role, plan, status, last_login_at)
       VALUES (?, 1, ?, ?, ?, 'free', 'active', NOW())`,
      [userEmail, name || userEmail.split('@')[0], avatarUrl || '', initialRole]
    );

    const newUserId = insertUserRes.insertId;

    await conn.query(
      `INSERT INTO auth_identities (user_id, provider, provider_subject, provider_email, is_private_email)
       VALUES (?, ?, ?, ?, ?)`,
      [newUserId, provider, providerSubject, normalizedEmail, isPrivateEmail ? 1 : 0]
    );

    if (isGoogleAdmin) {
      await conn.query(
        `INSERT INTO admin_audit_log (admin_id, action, target_user_id, details)
         VALUES (?, 'auto_bootstrap_admin', ?, ?)`,
        [newUserId, newUserId, JSON.stringify({ reason: 'Created new user matching ADMIN_EMAILS', email: normalizedEmail })]
      );
    }

    const [newUserRows] = await conn.query<any[]>('SELECT * FROM users WHERE id = ?', [newUserId]);
    return newUserRows[0] as User;
  });
}

export async function linkProviderToExistingUser(
  userId: number,
  params: FindOrCreateParams
): Promise<void> {
  const { provider, providerSubject, email, isPrivateEmail = false } = params;
  const normalizedEmail = email ? email.trim().toLowerCase() : null;

  // Check if provider_subject is already linked to another user
  const existingRows = await query<any[]>(
    'SELECT user_id FROM auth_identities WHERE provider = ? AND provider_subject = ?',
    [provider, providerSubject]
  );

  if (existingRows.length > 0) {
    if (existingRows[0].user_id === userId) {
      return; // Already linked to this user
    }
    throw new AppError({
      code: 'PROVIDER_ALREADY_LINKED',
      message: 'هذا الحساب مرتبط بالفعل بحساب مستخدم آخر',
      statusCode: 409
    });
  }

  await query(
    `INSERT INTO auth_identities (user_id, provider, provider_subject, provider_email, is_private_email)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, provider, providerSubject, normalizedEmail, isPrivateEmail ? 1 : 0]
  );
}

export async function getUserLinkedProviders(userId: number): Promise<AuthProviderType[]> {
  const rows = await query<any[]>(
    'SELECT provider FROM auth_identities WHERE user_id = ?',
    [userId]
  );
  return rows.map(r => r.provider);
}
