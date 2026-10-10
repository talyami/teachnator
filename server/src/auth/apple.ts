import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export interface AppleVerifiedPayload {
  email: string | null;
  sub: string;
  isPrivateEmail: boolean;
  nonce?: string;
}

export async function verifyAppleIdToken(idToken: string): Promise<AppleVerifiedPayload> {
  if (!idToken) {
    throw new AppError({
      code: 'MISSING_APPLE_TOKEN',
      message: 'رمز تسجيل دخول Apple مفقود',
      statusCode: 400
    });
  }

  try {
    const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: 'https://appleid.apple.com',
      audience: config.APPLE_CLIENT_ID || undefined
    });

    const sub = payload.sub;
    if (!sub) {
      throw new Error('Apple token missing sub claim');
    }

    const email = typeof payload.email === 'string' ? payload.email.toLowerCase().trim() : null;
    const isPrivate = payload.is_private_email === 'true' || 
                      payload.is_private_email === true || 
                      (email ? email.endsWith('@privaterelay.appleid.com') : false);

    return {
      email,
      sub,
      isPrivateEmail: isPrivate,
      nonce: typeof payload.nonce === 'string' ? payload.nonce : undefined
    };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    console.error('Apple token verification error:', err);
    throw new AppError({
      code: 'APPLE_VERIFICATION_FAILED',
      message: 'فشل التحقق من صحة رمز Apple: ' + (err.message || 'خطأ غير معروف'),
      statusCode: 401
    });
  }
}
