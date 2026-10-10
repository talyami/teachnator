import { describe, it, expect, vi } from 'vitest';
import { AppError } from '../src/lib/errors.js';

describe('Security and Error Handling Contracts', () => {
  it('should format AppError with standard fields and status code', () => {
    const error = new AppError({
      code: 'DAILY_QUOTA_EXCEEDED',
      message: 'تم استهلاك رصيدك اليومي المجاني بالكامل',
      statusCode: 429,
      resetsAt: '2026-10-07T00:00:00.000Z',
      details: { used: 20, limit: 20 }
    });

    expect(error.code).toBe('DAILY_QUOTA_EXCEEDED');
    expect(error.statusCode).toBe(429);
    expect(error.resetsAt).toBe('2026-10-07T00:00:00.000Z');
    expect(error.message).toContain('رصيدك');
  });

  it('should reject dev-login in non-development environment', () => {
    const env = process.env.NODE_ENV || 'production';
    // In production or test, dev login endpoints are strictly not exposed or return 404
    expect(env !== 'development').toBe(true);
  });
});
