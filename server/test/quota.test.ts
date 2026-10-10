import { describe, it, expect } from 'vitest';
import { getDailyLimitForUser, getRiyadhTodayMidnightSql, getNextRiyadhMidnightIso } from '../src/quota/plans.js';
import { User } from '@fast-learning/shared';

describe('Quota & Allowance Rules', () => {
  const baseUser: User = {
    id: 1,
    email: 'user@example.com',
    email_verified: true,
    name: 'Test User',
    avatar_url: '',
    role: 'user',
    plan: 'free',
    daily_ai_limit_override: null,
    assigned_key_id: null,
    status: 'active',
    created_at: new Date().toISOString(),
    last_login_at: null
  };

  it('should assign 20 daily units to free plan', () => {
    const limit = getDailyLimitForUser(baseUser);
    expect(limit).toBe(20);
  });

  it('should assign unlimited daily units to unlimited plan', () => {
    const unlimitedUser: User = { ...baseUser, plan: 'unlimited' };
    const limit = getDailyLimitForUser(unlimitedUser);
    expect(limit).toBeGreaterThan(1000);
  });

  it('should prioritize daily_ai_limit_override over plan', () => {
    const overriddenUser: User = { ...baseUser, plan: 'free', daily_ai_limit_override: 50 };
    const limit = getDailyLimitForUser(overriddenUser);
    expect(limit).toBe(50);
  });

  it('should compute Riyadh (UTC+3) midnight SQL format correctly', () => {
    const sql = getRiyadhTodayMidnightSql();
    // YYYY-MM-DD HH:mm:ss format for MySQL
    expect(sql).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('should compute next Riyadh midnight ISO date in the future', () => {
    const iso = getNextRiyadhMidnightIso();
    const nextDate = new Date(iso);
    const now = new Date();

    expect(nextDate.getTime()).toBeGreaterThan(now.getTime());
    // The next reset should be within 24 hours
    expect(nextDate.getTime() - now.getTime()).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
  });
});
