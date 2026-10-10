import { GoogleGenerativeAI } from '@google/generative-ai';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { decryptApiKey } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { User } from '@fast-learning/shared';

export const ALLOWED_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
] as const;

export const DEFAULT_MODEL = 'gemini-2.5-flash';

export interface ResolvedKeyInfo {
  apiKey: string;
  keyId: number | null;
  label: string;
  isDedicated: boolean;
}

/**
 * Resolves the API key for a user following the hierarchy:
 * 1. Dedicated user assignment in api_keys via users.assigned_key_id
 * 2. Shared pool key with is_default = 1 in api_keys table
 * 3. Fallback SERVER_GEMINI_API_KEY from .env
 */
export async function resolveApiKeyForUser(user: User): Promise<ResolvedKeyInfo> {
  // 1. Dedicated Key Assignment
  if (user.assigned_key_id) {
    const keyRows = await query<any[]>(
      'SELECT id, label, key_value, provider FROM api_keys WHERE id = ?',
      [user.assigned_key_id]
    );

    if (keyRows.length > 0) {
      const row = keyRows[0];
      const plainKey = decryptApiKey(row.key_value, config.KEY_ENCRYPTION_SECRET);
      if (plainKey && plainKey.trim().length > 0) {
        return {
          apiKey: plainKey.trim(),
          keyId: row.id,
          label: row.label,
          isDedicated: true
        };
      }
    }
  }

  // 2. Default shared pool key from database
  const defaultKeys = await query<any[]>(
    'SELECT id, label, key_value, provider FROM api_keys WHERE is_default = 1 LIMIT 1'
  );

  if (defaultKeys.length > 0) {
    const row = defaultKeys[0];
    const plainKey = decryptApiKey(row.key_value, config.KEY_ENCRYPTION_SECRET);
    if (plainKey && plainKey.trim().length > 0) {
      return {
        apiKey: plainKey.trim(),
        keyId: row.id,
        label: row.label,
        isDedicated: false
      };
    }
  }

  // 3. Fallback to .env configuration
  if (config.SERVER_GEMINI_API_KEY) {
    return {
      apiKey: config.SERVER_GEMINI_API_KEY.trim(),
      keyId: null,
      label: 'Server .env Default Key',
      isDedicated: false
    };
  }

  throw new AppError({
    code: 'NO_SERVER_KEY_AVAILABLE',
    message: 'لا يتوفر مفتاح ذكاء اصطناعي نشط في مسبح المفاتيح بالسيرفر حالياً. يرجى مراجعة لوحة المشرف أو استخدام مفتاحك الشخصي.',
    statusCode: 503
  });
}

export function validateModel(requestedModel?: string): string {
  if (!requestedModel) return DEFAULT_MODEL;
  if (ALLOWED_MODELS.includes(requestedModel as any)) {
    return requestedModel;
  }
  return DEFAULT_MODEL;
}

export function getGeminiModel(apiKey: string, modelName: string, systemInstruction?: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: validateModel(modelName),
    systemInstruction: systemInstruction ? { role: 'system', parts: [{ text: systemInstruction }] } : undefined
  });
}
