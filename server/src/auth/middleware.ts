import { Request, Response, NextFunction } from 'express';
import { query } from '../db/pool.js';
import { sha256 } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { SESSION_COOKIE_NAME } from './sessions.js';
import { User } from '@fast-learning/shared';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      rawSessionToken?: string;
    }
  }
}

export async function authenticateSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let rawToken: string | undefined = req.cookies?.[SESSION_COOKIE_NAME];

    // Also support Authorization header (Bearer token)
    if (!rawToken && req.headers.authorization?.startsWith('Bearer ')) {
      rawToken = req.headers.authorization.substring(7).trim();
    }

    if (!rawToken) {
      return next();
    }

    const idHash = sha256(rawToken);

    const rows = await query<any[]>(
      `SELECT s.id_hash, s.user_id, s.expires_at, s.revoked_at,
              u.id, u.email, u.email_verified, u.name, u.avatar_url,
              u.role, u.plan, u.daily_ai_limit_override, u.assigned_key_id,
              u.status, u.created_at, u.last_login_at
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.id_hash = ? AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
      [idHash]
    );

    if (rows.length === 0) {
      return next();
    }

    const sessionData = rows[0];

    // If user is banned, reject immediately
    if (sessionData.status === 'banned') {
      return next();
    }

    req.user = {
      id: sessionData.id,
      email: sessionData.email,
      email_verified: Boolean(sessionData.email_verified),
      name: sessionData.name,
      avatar_url: sessionData.avatar_url,
      role: sessionData.role,
      plan: sessionData.plan,
      daily_ai_limit_override: sessionData.daily_ai_limit_override,
      assigned_key_id: sessionData.assigned_key_id,
      status: sessionData.status,
      created_at: sessionData.created_at,
      last_login_at: sessionData.last_login_at
    };
    req.rawSessionToken = rawToken;

    // Update last seen periodically (fire and forget)
    query('UPDATE sessions SET last_seen_at = NOW() WHERE id_hash = ?', [idHash]).catch(() => {});

    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    throw new AppError({
      code: 'UNAUTHORIZED',
      message: 'يجب تسجيل الدخول للوصول إلى هذا المحتوى',
      statusCode: 401
    });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'ليس لديك صلاحيات المشرف لتنفيذ هذا الإجراء',
      statusCode: 403
    });
  }
  next();
}

// CSRF check on mutating HTTP methods
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const mutatingMethods = ['POST', 'PATCH', 'PUT', 'DELETE'];
  if (!mutatingMethods.includes(req.method)) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;
  // In development, allow localhost/127.0.0.1
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  if (origin) {
    const host = req.headers.host;
    if (host && origin.includes(host)) {
      return next();
    }
  }

  // If origin is completely missing on a cookie-authenticated request in prod, reject
  if (req.cookies?.[SESSION_COOKIE_NAME] && !origin) {
    throw new AppError({
      code: 'CSRF_BLOCKED',
      message: 'الطلب محظور لأسباب أمنية (CSRF)',
      statusCode: 403
    });
  }

  next();
}
