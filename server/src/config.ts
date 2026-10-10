import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('fast_learning_v2'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters').optional(),
  JWT_SECRET: z.string().optional(),
  KEY_ENCRYPTION_SECRET: z.string().min(16).optional(),
  GOOGLE_CLIENT_ID: z.string().default(''),
  APPLE_CLIENT_ID: z.string().default(''),
  ADMIN_EMAILS: z.string().default('talyami@gmail.com,admin@villa.linkflow.page'),
  SERVER_GEMINI_API_KEY: z.string().optional(),
  SERVER_AI_PROVIDER: z.enum(['gemini', 'vertex']).default('gemini'),
  BASE_URL: z.string().default('/fast-learning'),
  PUBLIC_APP_URL: z.string().default('https://villa.linkflow.page/fast-learning')
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Environment validation failed:');
  console.error(parsedEnv.error.format());
  throw new Error('Invalid environment configuration');
}

const rawConfig = parsedEnv.data;

// Session secret resolution
const sessionSecret = rawConfig.SESSION_SECRET || rawConfig.JWT_SECRET;
if (!sessionSecret) {
  throw new Error('FATAL: Either SESSION_SECRET or JWT_SECRET must be defined.');
}

// In production, require Google and Apple Client IDs and secure settings
if (rawConfig.NODE_ENV === 'production') {
  if (!rawConfig.GOOGLE_CLIENT_ID) {
    console.warn('⚠️ WARNING: GOOGLE_CLIENT_ID is not configured in production.');
  }
  if (!rawConfig.APPLE_CLIENT_ID) {
    console.warn('⚠️ WARNING: APPLE_CLIENT_ID is not configured in production.');
  }
}

export const config = {
  ...rawConfig,
  SESSION_SECRET: sessionSecret,
  KEY_ENCRYPTION_SECRET: rawConfig.KEY_ENCRYPTION_SECRET || sessionSecret,
  adminEmails: rawConfig.ADMIN_EMAILS
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean),
  isDev: rawConfig.NODE_ENV === 'development',
  isProd: rawConfig.NODE_ENV === 'production',
  isTest: rawConfig.NODE_ENV === 'test'
};
