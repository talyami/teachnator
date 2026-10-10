import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

let googleClient: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  if (!googleClient) {
    googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

export interface GoogleVerifiedPayload {
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl: string;
  sub: string;
  nonce?: string;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleVerifiedPayload> {
  if (!idToken) {
    throw new AppError({
      code: 'MISSING_ID_TOKEN',
      message: 'رمز تسجيل دخول Google مفقود',
      statusCode: 400
    });
  }

  try {
    const client = getClient();
    const ticket = await client.verifyIdToken({
      idToken,
      audience: config.GOOGLE_CLIENT_ID || undefined
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Google payload is empty');
    }

    if (!payload.email) {
      throw new AppError({
        code: 'GOOGLE_EMAIL_MISSING',
        message: 'تعذر استخراج البريد الإلكتروني من حساب Google',
        statusCode: 400
      });
    }

    if (!payload.email_verified) {
      throw new AppError({
        code: 'GOOGLE_EMAIL_NOT_VERIFIED',
        message: 'البريد الإلكتروني لحساب Google غير مؤكد',
        statusCode: 400
      });
    }

    return {
      email: payload.email.toLowerCase().trim(),
      emailVerified: true,
      name: payload.name || payload.given_name || payload.email.split('@')[0],
      avatarUrl: payload.picture || '',
      sub: payload.sub,
      nonce: (payload as any).nonce
    };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    console.error('Google token verification error:', err);
    throw new AppError({
      code: 'GOOGLE_VERIFICATION_FAILED',
      message: 'فشل التحقق من صحة رمز Google: ' + (err.message || 'خطأ غير معروف'),
      statusCode: 401
    });
  }
}
