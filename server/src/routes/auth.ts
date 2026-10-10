import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createAuthNonce, verifyAndConsumeNonce } from '../auth/nonce.js';
import { verifyGoogleIdToken } from '../auth/google.js';
import { verifyAppleIdToken } from '../auth/apple.js';
import { findOrCreateUserFromOAuth, linkProviderToExistingUser, getUserLinkedProviders } from '../auth/linking.js';
import { createSession, revokeSession } from '../auth/sessions.js';
import { requireAuth } from '../auth/middleware.js';
import { getUserUsageToday } from '../quota/usage.js';
import { sendError, AppError } from '../lib/errors.js';
import { UserProfile } from '@fast-learning/shared';

const router = Router();

// GET /api/auth/nonce
router.get('/nonce', async (req: Request, res: Response) => {
  try {
    const nonce = await createAuthNonce();
    res.json({ nonce });
  } catch (err) {
    sendError(res, err);
  }
});

// Helper to format UserProfile
async function buildUserProfile(user: any): Promise<UserProfile> {
  const usage = await getUserUsageToday(user.id, user.plan, user.daily_ai_limit_override);
  const providers = await getUserLinkedProviders(user.id);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar_url || '',
    role: user.role,
    plan: user.plan,
    dailyLimit: usage.limit,
    usedToday: usage.used,
    remainingToday: usage.remaining,
    resetsAt: usage.resetsAt,
    assignedKeyId: user.assigned_key_id,
    linkedProviders: providers
  };
}

// POST /api/auth/google
const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'idToken is required'),
  nonce: z.string().optional()
});

router.post('/google', async (req: Request, res: Response) => {
  try {
    const { idToken, nonce } = googleAuthSchema.parse(req.body);

    const verified = await verifyGoogleIdToken(idToken);

    // Verify nonce if sent
    const nonceToVerify = verified.nonce || nonce;
    if (nonceToVerify) {
      await verifyAndConsumeNonce(nonceToVerify);
    }

    const user = await findOrCreateUserFromOAuth({
      provider: 'google',
      providerSubject: verified.sub,
      email: verified.email,
      name: verified.name,
      avatarUrl: verified.avatarUrl,
      isPrivateEmail: false
    });

    if (user.status === 'banned') {
      throw new AppError({
        code: 'USER_BANNED',
        message: 'تم حظر هذا الحساب من استخدام المنصة',
        statusCode: 403
      });
    }

    await createSession(user.id, req, res);
    const profile = await buildUserProfile(user);

    res.json({ success: true, user: profile });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/auth/apple
const appleAuthSchema = z.object({
  idToken: z.string().min(1, 'idToken is required'),
  nonce: z.string().optional(),
  name: z.string().optional()
});

router.post('/apple', async (req: Request, res: Response) => {
  try {
    const { idToken, nonce, name } = appleAuthSchema.parse(req.body);

    const verified = await verifyAppleIdToken(idToken);

    const nonceToVerify = verified.nonce || nonce;
    if (nonceToVerify) {
      await verifyAndConsumeNonce(nonceToVerify);
    }

    const user = await findOrCreateUserFromOAuth({
      provider: 'apple',
      providerSubject: verified.sub,
      email: verified.email,
      name: name || (verified.email ? verified.email.split('@')[0] : 'مستخدم Apple'),
      avatarUrl: '',
      isPrivateEmail: verified.isPrivateEmail
    });

    if (user.status === 'banned') {
      throw new AppError({
        code: 'USER_BANNED',
        message: 'تم حظر هذا الحساب من استخدام المنصة',
        statusCode: 403
      });
    }

    await createSession(user.id, req, res);
    const profile = await buildUserProfile(user);

    res.json({ success: true, user: profile });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/auth/link/google
router.post('/link/google', requireAuth, async (req: Request, res: Response) => {
  try {
    const { idToken, nonce } = googleAuthSchema.parse(req.body);
    const verified = await verifyGoogleIdToken(idToken);

    if (verified.nonce || nonce) {
      await verifyAndConsumeNonce(verified.nonce || nonce!);
    }

    await linkProviderToExistingUser(req.user!.id, {
      provider: 'google',
      providerSubject: verified.sub,
      email: verified.email,
      name: verified.name,
      avatarUrl: verified.avatarUrl,
      isPrivateEmail: false
    });

    const profile = await buildUserProfile(req.user!);
    res.json({ success: true, user: profile });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/auth/link/apple
router.post('/link/apple', requireAuth, async (req: Request, res: Response) => {
  try {
    const { idToken, nonce, name } = appleAuthSchema.parse(req.body);
    const verified = await verifyAppleIdToken(idToken);

    if (verified.nonce || nonce) {
      await verifyAndConsumeNonce(verified.nonce || nonce!);
    }

    await linkProviderToExistingUser(req.user!.id, {
      provider: 'apple',
      providerSubject: verified.sub,
      email: verified.email,
      name: name || '',
      avatarUrl: '',
      isPrivateEmail: verified.isPrivateEmail
    });

    const profile = await buildUserProfile(req.user!);
    res.json({ success: true, user: profile });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  try {
    if (req.rawSessionToken) {
      await revokeSession(req.rawSessionToken, res);
    }
    res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
export { buildUserProfile };
