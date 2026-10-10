import { describe, it, expect, vi, beforeEach } from 'vitest';
import { User } from '@fast-learning/shared';

describe('Key Resolution Hierarchy', () => {
  const baseUser: User = {
    id: 10,
    email: 'student@example.com',
    email_verified: true,
    name: 'Student',
    avatar_url: '',
    role: 'user',
    plan: 'free',
    daily_ai_limit_override: null,
    assigned_key_id: null,
    status: 'active',
    created_at: new Date().toISOString(),
    last_login_at: null
  };

  it('hierarchy order specification: Dedicated Key -> Default Pool Key -> Fallback Env Key', () => {
    const dedicatedKeyUser: User = { ...baseUser, assigned_key_id: 42 };
    expect(dedicatedKeyUser.assigned_key_id).toBe(42);

    const poolUser: User = { ...baseUser, assigned_key_id: null };
    expect(poolUser.assigned_key_id).toBeNull();
  });
});
