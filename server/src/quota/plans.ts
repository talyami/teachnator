import { UserPlan } from '@fast-learning/shared';

export const PLAN_LIMITS: Record<UserPlan, number> = {
  free: 20,
  unlimited: 999999
};

export function getDailyLimitForUser(user: { plan: UserPlan; daily_ai_limit_override?: number | null }): number {
  if (user.daily_ai_limit_override !== null && user.daily_ai_limit_override !== undefined) {
    return user.daily_ai_limit_override;
  }
  return PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.free;
}

export const getNextRiyadhMidnightIso = getNextRiyadhResetTime;


/**
 * Returns ISO string for the next reset time (midnight in Riyadh: UTC+3)
 */
export function getNextRiyadhResetTime(): string {
  const now = new Date();
  // Riyadh is UTC+3
  const riyadhOffsetMs = 3 * 60 * 60 * 1000;
  const riyadhNow = new Date(now.getTime() + riyadhOffsetMs);

  const riyadhMidnight = new Date(riyadhNow);
  riyadhMidnight.setUTCHours(24, 0, 0, 0); // Next midnight in Riyadh time

  const utcReset = new Date(riyadhMidnight.getTime() - riyadhOffsetMs);
  return utcReset.toISOString();
}

/**
 * Returns SQL datetime string representing midnight today in Riyadh
 */
export function getRiyadhTodayMidnightSql(): string {
  const now = new Date();
  const riyadhOffsetMs = 3 * 60 * 60 * 1000;
  const riyadhNow = new Date(now.getTime() + riyadhOffsetMs);

  riyadhNow.setUTCHours(0, 0, 0, 0);
  const utcStart = new Date(riyadhNow.getTime() - riyadhOffsetMs);
  return utcStart.toISOString().slice(0, 19).replace('T', ' ');
}
