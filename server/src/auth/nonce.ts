import { query } from '../db/pool.js';
import { generateRandomToken, sha256 } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';

export async function createAuthNonce(): Promise<string> {
  const rawNonce = generateRandomToken(24);
  const nonceHash = sha256(rawNonce);
  
  // Expires in 10 minutes
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');

  await query(
    `INSERT INTO auth_nonces (nonce_hash, expires_at) VALUES (?, ?)`,
    [nonceHash, expiresAt]
  );

  return rawNonce;
}

export async function verifyAndConsumeNonce(rawNonce: string): Promise<void> {
  if (!rawNonce) {
    throw new AppError({
      code: 'MISSING_NONCE',
      message: 'رمز الأمان (nonce) مفقود في الطلب',
      statusCode: 400
    });
  }

  const nonceHash = sha256(rawNonce);
  const rows = await query<any[]>(
    `SELECT nonce_hash, expires_at, used_at FROM auth_nonces WHERE nonce_hash = ?`,
    [nonceHash]
  );

  if (rows.length === 0) {
    throw new AppError({
      code: 'INVALID_NONCE',
      message: 'رمز الأمان (nonce) غير صالح',
      statusCode: 400
    });
  }

  const record = rows[0];
  if (record.used_at) {
    throw new AppError({
      code: 'NONCE_REUSED',
      message: 'تم استخدام رمز الأمان (nonce) مسبقاً، يرجى إعادة المحاولة',
      statusCode: 400
    });
  }

  const expiresTime = new Date(record.expires_at).getTime();
  if (Date.now() > expiresTime) {
    throw new AppError({
      code: 'NONCE_EXPIRED',
      message: 'انتهت صلاحية رمز الأمان (nonce)',
      statusCode: 400
    });
  }

  // Mark as used
  await query(
    `UPDATE auth_nonces SET used_at = NOW() WHERE nonce_hash = ?`,
    [nonceHash]
  );
}
