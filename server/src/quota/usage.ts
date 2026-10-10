import { transaction, query } from '../db/pool.js';
import { PLAN_LIMITS, getNextRiyadhResetTime, getRiyadhTodayMidnightSql } from './plans.js';
import { AppError } from '../lib/errors.js';
import { AiTaskType, UserPlan } from '@fast-learning/shared';

export interface UserUsageInfo {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
}

export async function getUserUsageToday(
  userId: number,
  plan: UserPlan,
  limitOverride: number | null
): Promise<UserUsageInfo> {
  const midnightSql = getRiyadhTodayMidnightSql();
  const rows = await query<any[]>(
    `SELECT COALESCE(SUM(units), 0) as used_units
     FROM ai_usage
     WHERE user_id = ? AND created_at >= ? AND status IN ('reserved', 'ok')`,
    [userId, midnightSql]
  );

  const used = Number(rows[0]?.used_units || 0);
  const limit = limitOverride !== null ? limitOverride : PLAN_LIMITS[plan] || 20;
  const remaining = Math.max(0, limit - used);

  return {
    used,
    limit,
    remaining,
    resetsAt: getNextRiyadhResetTime()
  };
}

export async function reserveAiUnits(options: {
  userId: number;
  task: AiTaskType;
  units: number;
  model: string;
}): Promise<number> {
  const { userId, task, units, model } = options;
  const midnightSql = getRiyadhTodayMidnightSql();
  const resetsAt = getNextRiyadhResetTime();

  return await transaction(async (conn) => {
    // Lock the user record to guarantee serialization
    const [userRows] = await conn.query<any[]>(
      'SELECT id, role, plan, daily_ai_limit_override FROM users WHERE id = ? FOR UPDATE',
      [userId]
    );

    if (userRows.length === 0) {
      throw new AppError({
        code: 'USER_NOT_FOUND',
        message: 'المستخدم غير موجود',
        statusCode: 404
      });
    }

    const user = userRows[0];
    const isAdmin = user.role === 'admin';
    const limit = user.daily_ai_limit_override !== null
      ? user.daily_ai_limit_override
      : (PLAN_LIMITS[user.plan as UserPlan] || 20);

    // Admins and unlimited plan users have effectively unlimited units
    if (!isAdmin && user.plan !== 'unlimited') {
      const [usageRows] = await conn.query<any[]>(
        `SELECT COALESCE(SUM(units), 0) as current_used
         FROM ai_usage
         WHERE user_id = ? AND created_at >= ? AND status IN ('reserved', 'ok')`,
        [userId, midnightSql]
      );

      const currentUsed = Number(usageRows[0]?.current_used || 0);
      if (currentUsed + units > limit) {
        throw new AppError({
          code: 'QUOTA_EXCEEDED',
          message: `لقد استهلكت رصيدك اليومي المجاني (${limit} وحدة). يتم تجديد الرصيد عند منتصف الليل بتوقيت الرياض. يمكنك إضافة مفتاحك الشخصي للاستمرار بلا حدود.`,
          statusCode: 429,
          resetsAt
        });
      }
    }

    const [res] = await conn.query<any>(
      `INSERT INTO ai_usage (user_id, task, units, model, status)
       VALUES (?, ?, ?, ?, 'reserved')`,
      [userId, task, units, model]
    );

    return res.insertId;
  });
}

export async function finalizeAiUnits(
  usageId: number,
  tokens?: { inputTokens?: number; outputTokens?: number }
): Promise<void> {
  await query(
    `UPDATE ai_usage
     SET status = 'ok', input_tokens = ?, output_tokens = ?
     WHERE id = ?`,
    [tokens?.inputTokens || null, tokens?.outputTokens || null, usageId]
  );
}

export async function refundAiUnits(usageId: number): Promise<void> {
  await query(
    `UPDATE ai_usage SET status = 'error' WHERE id = ?`,
    [usageId]
  );
}
