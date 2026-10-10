import { query } from '../db/pool.js';

export async function logAdminAction(options: {
  adminId: number;
  action: string;
  targetUserId?: number | null;
  details?: unknown;
}): Promise<void> {
  const { adminId, action, targetUserId = null, details = null } = options;
  try {
    await query(
      `INSERT INTO admin_audit_log (admin_id, action, target_user_id, details)
       VALUES (?, ?, ?, ?)`,
      [adminId, action, targetUserId, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('Failed to write admin audit log:', err);
  }
}
