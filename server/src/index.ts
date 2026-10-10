import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';

import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { isDbConnected } from './db/pool.js';
import { authenticateSession, csrfProtection } from './auth/middleware.js';
import { sendError } from './lib/errors.js';

import configRouter from './routes/config.js';
import authRouter from './routes/auth.js';
import meRouter from './routes/me.js';
import materialsRouter from './routes/materials.js';
import attemptsRouter from './routes/attempts.js';
import aiRouter from './routes/ai.js';
import adminRouter from './routes/admin.js';

const app = express();

// Security Headers with CSP allowing Google and Apple SDKs
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://accounts.google.com/gsi/client',
          'https://appleid.cdn-apple.com',
          'https://cdnjs.cloudflare.com',
          'https://cdn.tailwindcss.com',
          'https://cdn.jsdelivr.net'
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdnjs.cloudflare.com'
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        connectSrc: [
          "'self'",
          'https://accounts.google.com',
          'https://appleid.apple.com',
          'https://generativelanguage.googleapis.com',
          'https://texttospeech.googleapis.com'
        ],
        frameSrc: ['https://accounts.google.com', 'https://appleid.apple.com']
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(
  cors({
    origin: (origin, callback) => callback(null, true), // allows same-origin and local dev
    credentials: true
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Route prefix normalization: support both /fast-learning/api/* and /api/*
app.use((req, res, next) => {
  if (req.url.startsWith('/fast-learning/api')) {
    req.url = req.url.replace('/fast-learning/api', '/api');
  }
  next();
});

// Rate limiting for auth and AI routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'طلبات تسجيل الدخول كثيرة جداً، يرجى المحاولة لاحقاً' } }
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'طلبات الذكاء الاصطناعي كثيرة جداً، يرجى الانتظار قليلاً' } }
});

// Global session authentication
app.use(authenticateSession);

// CSRF check on mutating requests
app.use(csrfProtection);

// Mount API routes
app.use('/api/config', configRouter);
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/me', meRouter);
app.use('/api/materials', materialsRouter);
app.use('/api/attempts', attemptsRouter);
app.use('/api/ai', aiLimiter, aiRouter);
app.use('/api/admin', adminRouter);

// Static frontend serving
// Priority: web/dist (Vite build) > public/ (fallback)
const distDir = path.resolve(__dirname, '../../web/dist');
const publicDir = path.resolve(__dirname, '../../public');
const staticDir = fs.existsSync(distDir) ? distDir : publicDir;

if (fs.existsSync(staticDir)) {
  app.use('/fast-learning', express.static(staticDir));
  app.use(express.static(staticDir));

  app.get('/fast-learning/*', (req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });

  app.get('*', (req, res, next) => {
    if (req.url.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

// Central Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  sendError(res, err);
});

// Server bootstrap
export async function startServer() {
  console.log('🚀 Starting Fast Learning Server v2...');

  try {
    await runMigrations();
  } catch (err: any) {
    console.warn('⚠️ Migration check failed (continuing if DB is warming up):', err.message);
  }

  const server = app.listen(config.PORT, () => {
    console.log(`\n===========================================`);
    console.log(`⚡ Fast Learning Backend running on port ${config.PORT}`);
    console.log(`🌍 Base path: /fast-learning/`);
    console.log(`🔒 Environment: ${config.NODE_ENV}`);
    console.log(`===========================================\n`);
  });

  return server;
}

if (process.argv[1] && (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'))) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
