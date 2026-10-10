import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import { config } from '../config.js';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.DB_HOST,
      port: config.DB_PORT,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      database: config.DB_NAME,
      waitForConnections: true,
      connectionLimit: 15,
      queueLimit: 0,
      charset: 'utf8mb4',
      dateStrings: true
    });
  }
  return pool;
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T> {
  const p = getPool();
  const [results] = await p.query(sql, params);
  return results as T;
}

export async function transaction<T>(
  callback: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const p = getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function isDbConnected(): Promise<boolean> {
  try {
    const p = getPool();
    const [res] = await p.query('SELECT 1 as connected');
    return Array.isArray(res) && res.length > 0;
  } catch (err) {
    return false;
  }
}
