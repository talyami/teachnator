'use strict';
const { createHash, randomBytes } = require('node:crypto');

const ERROR_CODES = Object.freeze([
  'INTERNAL_ERROR', 'HTTP_5XX', 'DB_UNAVAILABLE', 'AI_UPSTREAM_FAILURE', 'AI_REQUEST_FAILED',
  'CLIENT_RUNTIME_ERROR', 'CLIENT_UNHANDLED_REJECTION', 'CLIENT_RESOURCE_ERROR', 'CLIENT_RENDER_ERROR',
  'BACKUP_FAILED', 'MAINTENANCE_FAILED', 'MONITOR_FAILED'
]);
const CLIENT_CODES = new Set(ERROR_CODES.filter(code => code.startsWith('CLIENT_')));
const DEFAULT_ROUTES = Object.freeze([
  '/', '/api/config', '/api/ready', '/api/client-errors', '/api/auth/google', '/api/auth/me',
  '/api/me', '/api/materials', '/api/materials/:id', '/api/progress', '/api/progress/:id',
  '/api/ai/generate', '/api/ai/evaluate', '/api/ai/tts', '/api/admin/:operation',
  '/privacy', '/terms', '/contact'
]);
function safeRelease(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value) ? value : 'unknown';
}
function createReportLimiter({ now = Date.now, windowMs = 60000, perKey = 10, globalLimit = 100, maxKeys = 1000 } = {}) {
  for (const value of [windowMs, perKey, globalLimit, maxKeys]) if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid report limiter configuration.');
  const salt = randomBytes(32);
  const buckets = new Map();
  let globalBucket = { count: 0, since: now() };
  return {
    allow(key = 'anonymous') {
      const time = now();
      if (time - globalBucket.since >= windowMs || time < globalBucket.since) { globalBucket = { count: 0, since: time }; buckets.clear(); }
      if (globalBucket.count >= globalLimit) return false;
      // Keys never reach logs/webhooks. Store only a salted digest in bounded memory.
      const digest = createHash('sha256').update(salt).update(String(key).slice(0, 512)).digest('hex');
      let bucket = buckets.get(digest);
      if (!bucket || time - bucket.since >= windowMs) {
        if (!bucket && buckets.size >= maxKeys) return false;
        bucket = { count: 0, since: time }; buckets.set(digest, bucket);
      }
      if (bucket.count >= perKey) return false;
      bucket.count++; globalBucket.count++;
      return true;
    }
  };
}
function createNotificationGate({ now = Date.now, dedupeMs = 300000, windowMs = 60000, globalLimit = 5, maxKeys = 500 } = {}) {
  for (const value of [dedupeMs, windowMs, globalLimit, maxKeys]) if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid notification throttle configuration.');
  const seen = new Map();
  let windowStart = now(), count = 0;
  return {
    allow(event) {
      const time = now();
      if (time < windowStart) { seen.clear(); windowStart = time; count = 0; }
      if (time - windowStart >= windowMs) { windowStart = time; count = 0; }
      for (const [key, at] of seen) if (time - at >= dedupeMs) seen.delete(key);
      // Exclude browser-controlled line/column/status to prevent notification-cardinality bypass.
      const key = JSON.stringify([event.source, event.code, event.release, event.route || '']);
      if (seen.has(key) || count >= globalLimit || seen.size >= maxKeys) return false;
      seen.set(key, time); count++;
      return true;
    }
  };
}
function createErrorTracker({ release = 'unknown', logger = console, notify, now = Date.now, routes = DEFAULT_ROUTES, assets = [], limiter = createReportLimiter({ now }), notificationGate = createNotificationGate({ now }) } = {}) {
  const routeSet = new Set(routes.filter(route => typeof route === 'string' && /^\/(?:[A-Za-z0-9_:/.-]*)$/.test(route) && !route.includes('..')));
  // Pass only filenames from the server's build output/manifest, never browser supplied URLs.
  const assetSet = new Set(assets.filter(asset => typeof asset === 'string' && /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(?:js|css)$/.test(asset)));
  const ownedRelease = safeRelease(release);
  function capture(input, source) {
    const object = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const code = source === 'client' ? (CLIENT_CODES.has(object.code) ? object.code : 'CLIENT_RUNTIME_ERROR') : (ERROR_CODES.includes(object.code) && !CLIENT_CODES.has(object.code) ? object.code : 'INTERNAL_ERROR');
    const event = { type: 'application_error', timestamp: new Date(now()).toISOString(), source, code, release: ownedRelease };
    if (routeSet.has(object.route)) event.route = object.route;
    if (Number.isInteger(object.status) && object.status >= 400 && object.status <= 599) event.status = object.status;
    if (assetSet.has(object.asset)) {
      event.asset = object.asset;
      for (const field of ['line', 'column']) if (Number.isInteger(object[field]) && object[field] >= 0 && object[field] <= 10000000) event[field] = object[field];
    }
    // Never serialize Error objects, raw messages, stacks, document data, request objects or arbitrary metadata.
    try { if (typeof logger === 'function') logger(JSON.stringify(event)); else logger.error(JSON.stringify(event)); } catch { /* Telemetry must not break a request. */ }
    if (typeof notify === 'function' && notificationGate.allow(event)) {
      // The gate limits attempts, including failed deliveries; it is not a delivery receipt.
      try { Promise.resolve(notify({ ...event })).catch(() => {}); } catch { /* No raw webhook failure logging. */ }
    }
    return event;
  }
  return {
    captureServer(input = {}) { return capture(input, 'server'); },
    captureClient(input, { rateKey = 'anonymous' } = {}) {
      if (!limiter.allow(rateKey)) return { accepted: false, reason: 'rate_limited' };
      if (!input || typeof input !== 'object' || Array.isArray(input) || !CLIENT_CODES.has(input.code)) return { accepted: false, reason: 'invalid_report' };
      capture(input, 'client');
      return { accepted: true };
    }
  };
}
module.exports = { ERROR_CODES, DEFAULT_ROUTES, safeRelease, createReportLimiter, createNotificationGate, createErrorTracker };
