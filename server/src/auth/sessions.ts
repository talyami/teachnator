import { Response, Request } from 'express';
import { query } from '../db/pool.js';
import { generateRandomToken, sha256 } from '../lib/crypto.js';
import { config } from '../config.js';

export const SESSION_COOKIE_NAME = 'fl_session';

export function getCookiePath(): string {
  return config.isProd ? '/fast-learning' : '/';
}

export async function createSession(
  userId: number,
  req: Request,
  res: Response
): Promise<string> {
  const rawToken = generateRandomToken(32);
  const idHash = sha256(rawToken);

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = (req.headers['user-agent'] || 'Unknown').slice(0, 255);

  const expiresDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const expiresAt = expiresDate.toISOString().slice(0, 19).replace('T', ' ');

  await query(
    `INSERT INTO sessions (id_hash, user_id, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [idHash, userId, expiresAt, ip, userAgent]
  );

  // Set httpOnly cookie
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    path: getCookiePath(),
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

  return rawToken;
}

export async function revokeSession(rawToken: string, res?: Response): Promise<void> {
  if (!rawToken) return;
  const idHash = sha256(rawToken);
  await query(
    `UPDATE sessions SET revoked_at = NOW() WHERE id_hash = ?`,
    [idHash]
  );

  if (res) {
    res.clearCookie(SESSION_COOKIE_NAME, {
      path: getCookiePath()
    });
  }
}

export async function revokeAllUserSessions(userId: number): Promise<void> {
  await query(
    `UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  );
}
