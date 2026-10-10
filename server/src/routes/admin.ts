import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../auth/middleware.js';
import { query, transaction } from '../db/pool.js';
import { logAdminAction } from '../lib/audit.js';
import { sendError, AppError } from '../lib/errors.js';
import { encryptApiKey, maskApiKey } from '../lib/crypto.js';
import { config } from '../config.js';
import { getRiyadhTodayMidnightSql } from '../quota/plans.js';
import { getGeminiModel } from '../ai/gemini.js';
import {
  AdminStats,
  AdminUserListItem,
  ApiKeyItem,
  AuditLogItem
} from '@fast-learning/shared';

const router = Router();

// Enforce admin permission for every route in this file
router.use(requireAdmin);

// GET /api/admin/stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const midnightSql = getRiyadhTodayMidnightSql();

    const [uRows] = await query<any[]>('SELECT COUNT(*) as count FROM users');
    const [actRows] = await query<any[]>(
      'SELECT COUNT(*) as count FROM users WHERE last_login_at >= ?',
      [midnightSql]
    );
    const [mRows] = await query<any[]>('SELECT COUNT(*) as count FROM materials WHERE deleted_at IS NULL');
    const [attRows] = await query<any[]>('SELECT COUNT(*) as count FROM quiz_attempts');
    const [aiRows] = await query<any[]>(
      `SELECT COALESCE(SUM(units), 0) as count
       FROM ai_usage
       WHERE created_at >= ? AND status IN ('reserved', 'ok')`,
      [midnightSql]
    );
    const [kRows] = await query<any[]>('SELECT COUNT(*) as count FROM api_keys');

    const stats: AdminStats = {
      totalUsers: Number(uRows[0]?.count || 0),
      activeToday: Number(actRows[0]?.count || 0),
      totalMaterials: Number(mRows[0]?.count || 0),
      totalAttempts: Number(attRows[0]?.count || 0),
      aiUnitsToday: Number(aiRows[0]?.count || 0),
      keyPoolCount: Number(kRows[0]?.count || 0)
    };

    res.json(stats);
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/admin/users?search=&page=
router.get('/users', async (req: Request, res: Response) => {
  try {
    const search = ((req.query.search as string) || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const midnightSql = getRiyadhTodayMidnightSql();

    let sql = `
      SELECT u.id, u.email, u.name, u.avatar_url, u.role, u.plan,
             u.daily_ai_limit_override, u.assigned_key_id, u.status,
             u.created_at, u.last_login_at,
             k.label as assigned_key_label
      FROM users u
      LEFT JOIN api_keys k ON u.assigned_key_id = k.id
    `;
    const params: any[] = [];

    if (search) {
      sql += ' WHERE u.email LIKE ? OR u.name LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const users = await query<any[]>(sql, params);

    // Populate usage today, material counts, session counts, linked providers
    const userList: AdminUserListItem[] = [];

    for (const u of users) {
      const [usageRow] = await query<any[]>(
        `SELECT COALESCE(SUM(units), 0) as units
         FROM ai_usage
         WHERE user_id = ? AND created_at >= ? AND status IN ('reserved', 'ok')`,
        [u.id, midnightSql]
      );

      const [matRow] = await query<any[]>(
        'SELECT COUNT(*) as count FROM materials WHERE user_id = ? AND deleted_at IS NULL',
        [u.id]
      );

      const [sessRow] = await query<any[]>(
        'SELECT COUNT(*) as count FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()',
        [u.id]
      );

      const provRows = await query<any[]>(
        'SELECT provider FROM auth_identities WHERE user_id = ?',
        [u.id]
      );

      userList.push({
        id: u.id,
        email: u.email,
        name: u.name,
        avatar_url: u.avatar_url || '',
        role: u.role,
        plan: u.plan,
        daily_ai_limit_override: u.daily_ai_limit_override,
        assigned_key_id: u.assigned_key_id,
        assigned_key_label: u.assigned_key_label,
        status: u.status,
        created_at: u.created_at,
        last_login_at: u.last_login_at,
        usage_today: Number(usageRow[0]?.units || 0),
        material_count: Number(matRow[0]?.count || 0),
        session_count: Number(sessRow[0]?.count || 0),
        linked_providers: provRows.map(p => p.provider)
      });
    }

    const [totalRows] = await query<any[]>(
      search
        ? 'SELECT COUNT(*) as count FROM users WHERE email LIKE ? OR name LIKE ?'
        : 'SELECT COUNT(*) as count FROM users',
      search ? [`%${search}%`, `%${search}%`] : []
    );

    res.json({
      users: userList,
      total: Number(totalRows[0]?.count || 0),
      page,
      totalPages: Math.ceil(Number(totalRows[0]?.count || 0) / limit)
    });
  } catch (err) {
    sendError(res, err);
  }
});

// PATCH /api/admin/users/:id
const updateUserSchema = z.object({
  plan: z.enum(['free', 'unlimited']).optional(),
  daily_ai_limit_override: z.number().nullable().optional(),
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'banned']).optional()
});

router.patch('/users/:id', async (req: Request, res: Response) => {
  try {
    const targetUserId = Number(req.params.id);
    const adminId = req.user!.id;
    const data = updateUserSchema.parse(req.body);

    // Rule: Admin cannot demote or ban themselves
    if (targetUserId === adminId) {
      if (data.role && data.role !== 'admin') {
        throw new AppError({
          code: 'CANNOT_DEMOTE_SELF',
          message: 'لا يمكنك سحب صلاحية الإدارة من حسابك الخاص',
          statusCode: 400
        });
      }
      if (data.status && data.status === 'banned') {
        throw new AppError({
          code: 'CANNOT_BAN_SELF',
          message: 'لا يمكنك حظر حسابك الخاص',
          statusCode: 400
        });
      }
    }

    await query(
      `UPDATE users
       SET plan = COALESCE(?, plan),
           daily_ai_limit_override = CASE WHEN ? THEN ? ELSE daily_ai_limit_override END,
           role = COALESCE(?, role),
           status = COALESCE(?, status)
       WHERE id = ?`,
      [
        data.plan ?? null,
        data.daily_ai_limit_override !== undefined ? 1 : 0,
        data.daily_ai_limit_override ?? null,
        data.role ?? null,
        data.status ?? null,
        targetUserId
      ]
    );

    // If banned, revoke all their active sessions immediately
    if (data.status === 'banned') {
      await query(
        'UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
        [targetUserId]
      );
    }

    await logAdminAction({
      adminId,
      action: 'update_user_settings',
      targetUserId,
      details: data
    });

    res.json({ success: true, message: 'تم تحديث بيانات المستخدم بنجاح' });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/admin/users/:id/revoke-sessions
router.post('/users/:id/revoke-sessions', async (req: Request, res: Response) => {
  try {
    const targetUserId = Number(req.params.id);
    const adminId = req.user!.id;

    await query(
      'UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
      [targetUserId]
    );

    await logAdminAction({
      adminId,
      action: 'revoke_user_sessions',
      targetUserId,
      details: { reason: 'Admin revoked sessions manually' }
    });

    res.json({ success: true, message: 'تم إنهاء جميع جلسات المستخدم بنجاح' });
  } catch (err) {
    sendError(res, err);
  }
});

// PATCH /api/admin/users/:id/key
const assignKeySchema = z.object({
  keyId: z.number().nullable() // null = shared pool, number = dedicated
});

router.patch('/users/:id/key', async (req: Request, res: Response) => {
  try {
    const targetUserId = Number(req.params.id);
    const adminId = req.user!.id;
    const { keyId } = assignKeySchema.parse(req.body);

    if (keyId !== null) {
      const keyRows = await query<any[]>('SELECT id FROM api_keys WHERE id = ?', [keyId]);
      if (keyRows.length === 0) {
        throw new AppError({
          code: 'KEY_NOT_FOUND',
          message: 'المفتاح المحدد غير موجود في مسبح المفاتيح',
          statusCode: 404
        });
      }
    }

    await query(
      'UPDATE users SET assigned_key_id = ? WHERE id = ?',
      [keyId, targetUserId]
    );

    await logAdminAction({
      adminId,
      action: 'assign_user_key',
      targetUserId,
      details: { assignedKeyId: keyId }
    });

    res.json({ success: true, message: 'تم تحديث تعيين المفتاح للمستخدم بنجاح' });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/admin/keys
router.get('/keys', async (req: Request, res: Response) => {
  try {
    const rows = await query<any[]>(
      `SELECT k.id, k.label, k.provider, k.is_default, k.created_at, k.key_value,
              COUNT(u.id) as assigned_user_count
       FROM api_keys k
       LEFT JOIN users u ON u.assigned_key_id = k.id
       GROUP BY k.id
       ORDER BY k.is_default DESC, k.created_at DESC`
    );

    const keys: ApiKeyItem[] = rows.map((r: any) => ({
      id: r.id,
      label: r.label,
      provider: r.provider,
      is_default: Boolean(r.is_default),
      created_at: r.created_at,
      masked_key: maskApiKey(r.key_value),
      assigned_user_count: Number(r.assigned_user_count || 0)
    }));

    res.json(keys);
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/admin/keys
const createKeySchema = z.object({
  label: z.string().min(1).max(100),
  keyValue: z.string().min(5),
  provider: z.enum(['gemini', 'vertex']).default('gemini'),
  isDefault: z.boolean().default(false)
});

router.post('/keys', async (req: Request, res: Response) => {
  try {
    const data = createKeySchema.parse(req.body);
    const adminId = req.user!.id;

    const encryptedKey = encryptApiKey(data.keyValue.trim(), config.KEY_ENCRYPTION_SECRET);

    await transaction(async (conn) => {
      if (data.isDefault) {
        await conn.query('UPDATE api_keys SET is_default = 0');
      }

      const [res] = await conn.query<any>(
        `INSERT INTO api_keys (label, key_value, provider, is_default)
         VALUES (?, ?, ?, ?)`,
        [data.label, encryptedKey, data.provider, data.isDefault ? 1 : 0]
      );

      await logAdminAction({
        adminId,
        action: 'add_server_api_key',
        details: { keyId: res.insertId, label: data.label, provider: data.provider, isDefault: data.isDefault }
      });
    });

    res.status(201).json({ success: true, message: 'تمت إضافة المفتاح إلى المسبح بنجاح' });
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/admin/keys/:id
router.delete('/keys/:id', async (req: Request, res: Response) => {
  try {
    const keyId = Number(req.params.id);
    const adminId = req.user!.id;

    await transaction(async (conn) => {
      // Revert users assigned to this key back to shared pool
      await conn.query('UPDATE users SET assigned_key_id = NULL WHERE assigned_key_id = ?', [keyId]);
      await conn.query('DELETE FROM api_keys WHERE id = ?', [keyId]);

      await logAdminAction({
        adminId,
        action: 'delete_server_api_key',
        details: { keyId }
      });
    });

    res.json({ success: true, message: 'تم حذف المفتاح من المسبح بنجاح وتعيين المستخدمين للمسبح المشترك' });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/admin/test-ai
router.post('/test-ai', async (req: Request, res: Response) => {
  try {
    const { keyId } = req.body;
    let plainKey: string = '';

    if (keyId) {
      const rows = await query<any[]>('SELECT key_value FROM api_keys WHERE id = ?', [keyId]);
      if (rows.length === 0) throw new Error('Key not found');
      const { decryptApiKey } = await import('../lib/crypto.js');
      plainKey = decryptApiKey(rows[0].key_value, config.KEY_ENCRYPTION_SECRET);
    } else {
      const { resolveApiKeyForUser } = await import('../ai/gemini.js');
      const resolved = await resolveApiKeyForUser(req.user!);
      plainKey = resolved.apiKey;
    }

    const model = getGeminiModel(plainKey, 'gemini-2.5-flash');
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'قل كلمة واحدة: جاهز' }] }]
    });

    const reply = result.response.text().trim();
    res.json({
      success: true,
      message: 'الاتصال بمفتاح الذكاء الاصطناعي يعمل بكفاءة تامة ✅',
      reply
    });
  } catch (err: any) {
    console.error('Test AI error:', err);
    res.status(500).json({
      success: false,
      message: 'فشل اختبار المفتاح: ' + (err.message || 'خطأ غير معروف')
    });
  }
});

// GET /api/admin/audit-log
router.get('/audit-log', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = 30;
    const offset = (page - 1) * limit;

    const rows = await query<any[]>(
      `SELECT l.id, l.admin_id, l.action, l.target_user_id, l.details, l.created_at,
              uAdmin.email as admin_email,
              uTarget.email as target_user_email
       FROM admin_audit_log l
       LEFT JOIN users uAdmin ON l.admin_id = uAdmin.id
       LEFT JOIN users uTarget ON l.target_user_id = uTarget.id
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const logItems: AuditLogItem[] = rows.map((r: any) => ({
      id: r.id,
      admin_id: r.admin_id,
      admin_email: r.admin_email || 'System',
      action: r.action,
      target_user_id: r.target_user_id,
      target_user_email: r.target_user_email,
      details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
      created_at: r.created_at
    }));

    res.json(logItems);
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
