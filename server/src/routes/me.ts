import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { buildUserProfile } from './auth.js';
import { query } from '../db/pool.js';
import { sendError } from '../lib/errors.js';

const router = Router();

// GET /api/me
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const profile = await buildUserProfile(req.user!);
    res.json(profile);
  } catch (err) {
    sendError(res, err);
  }
});

// PATCH /api/me
const updateMeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().or(z.literal('')).optional()
});

router.patch('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, avatarUrl } = updateMeSchema.parse(req.body);

    if (name !== undefined || avatarUrl !== undefined) {
      await query(
        `UPDATE users
         SET name = COALESCE(?, name),
             avatar_url = COALESCE(?, avatar_url)
         WHERE id = ?`,
        [name ?? null, avatarUrl ?? null, req.user!.id]
      );

      const [updatedRows] = await query<any[]>('SELECT * FROM users WHERE id = ?', [req.user!.id]);
      req.user = updatedRows[0];
    }

    const profile = await buildUserProfile(req.user!);
    res.json({ success: true, user: profile });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
