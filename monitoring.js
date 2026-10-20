'use strict';
const { boundedInteger } = require('./retention_policy');
const { ERROR_CODES, safeRelease, DEFAULT_ROUTES } = require('./error_tracking');

const CHECKS = Object.freeze(['readiness', 'latency', 'backup', 'disk']);
function monitoringError(code) { const error = new Error(code); error.code = code; return error; }
function webhookUrl(value) {
  if (!value) return null;
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020\u007f]/.test(value)) throw monitoringError('INVALID_MONITOR_WEBHOOK');
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error();
    return url.href;
  } catch { throw monitoringError('INVALID_MONITOR_WEBHOOK'); }
}
function getMonitorConfig(env = process.env) {
  return Object.freeze({
    webhook: webhookUrl(env.MONITOR_WEBHOOK_URL),
    webhookTimeoutMs: boundedInteger(env.MONITOR_WEBHOOK_TIMEOUT_MS, 3000, 250, 10000, 'MONITOR_WEBHOOK_TIMEOUT_MS'),
    cooldownMs: boundedInteger(env.MONITOR_ALERT_COOLDOWN_SECONDS, 1800, 60, 86400, 'MONITOR_ALERT_COOLDOWN_SECONDS') * 1000,
    maxLatencyMs: boundedInteger(env.MONITOR_MAX_LATENCY_MS, 2000, 100, 30000, 'MONITOR_MAX_LATENCY_MS'),
    maxBackupAgeMs: boundedInteger(env.MONITOR_MAX_BACKUP_AGE_HOURS, 36, 1, 720, 'MONITOR_MAX_BACKUP_AGE_HOURS') * 3600000,
    diskMinFreePercent: boundedInteger(env.MONITOR_DISK_MIN_FREE_PERCENT, 10, 1, 90, 'MONITOR_DISK_MIN_FREE_PERCENT'),
    diskPath: env.MONITOR_DISK_PATH || null
  });
}
function cleanNotification(input) {
  if (!input || typeof input !== 'object') throw monitoringError('INVALID_MONITOR_EVENT');
  const release = safeRelease(input.release);
  if (input.type === 'application_error') {
    if (!ERROR_CODES.includes(input.code) || !['server', 'client'].includes(input.source)) throw monitoringError('INVALID_MONITOR_EVENT');
    const event = { type: 'application_error', code: input.code, source: input.source, release };
    if (DEFAULT_ROUTES.includes(input.route)) event.route = input.route;
    if (Number.isInteger(input.status) && input.status >= 400 && input.status <= 599) event.status = input.status;
    // Asset location is local-only unless separately reviewed; no stack/message travels remotely.
    return event;
  }
  if (input.type !== 'monitor_transition' || !['failure', 'recovery'].includes(input.state)) throw monitoringError('INVALID_MONITOR_EVENT');
  const failed = CHECKS.filter(check => Array.isArray(input.failedChecks) && input.failedChecks.includes(check));
  return { type: 'monitor_transition', state: input.state, failedChecks: failed, release };
}
function createWebhookNotifier({ env = process.env, fetchImpl = global.fetch } = {}) {
  const config = getMonitorConfig(env);
  async function notify(input) {
    if (!config.webhook) return { delivered: false, reason: 'not_configured' };
    const event = cleanNotification(input);
    try {
      const response = await fetchImpl(config.webhook, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(config.webhookTimeoutMs), headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) });
      // Ignore all response bodies: errors and redirect locations can contain secrets.
      try { await response.body?.cancel(); } catch { /* no response body logging */ }
      if (!response.ok) throw monitoringError('MONITOR_DELIVERY_FAILED');
      return { delivered: true };
    } catch { throw monitoringError('MONITOR_DELIVERY_FAILED'); }
  }
  notify.configured = Boolean(config.webhook);
  return notify;
}
function validateMonitorState(input) {
  const validChecks = values => Array.isArray(values) && values.length <= CHECKS.length && new Set(values).size === values.length && values.every(check => CHECKS.includes(check));
  if (!input || input.version !== 1 || !['healthy', 'failure'].includes(input.current)) return null;
  if (!validChecks(input.failedChecks) || (input.current === 'healthy') !== (input.failedChecks.length === 0)) return null;
  const delivery = input.lastDelivered;
  if (delivery !== null && (!delivery || !['failure', 'recovery'].includes(delivery.state) || !Number.isSafeInteger(delivery.at) || delivery.at < 0 || !validChecks(delivery.failedChecks) || (delivery.state === 'recovery') !== (delivery.failedChecks.length === 0))) return null;
  return { version: 1, current: input.current, failedChecks: CHECKS.filter(check => input.failedChecks.includes(check)), lastDelivered: delivery && { state: delivery.state, at: delivery.at, failedChecks: CHECKS.filter(check => delivery.failedChecks.includes(check)) } };
}
async function evaluateMonitor({ checks, previous = null, now = Date.now(), cooldownMs = 1800000, notify, release = 'unknown' }) {
  const prior = validateMonitorState(previous);
  const failedChecks = CHECKS.filter(check => checks[check] === false);
  const current = failedChecks.length ? 'failure' : 'healthy';
  const state = { version: 1, current, failedChecks, lastDelivered: prior?.lastDelivered || null };
  const last = state.lastDelivered;
  let transition = null;
  if (current === 'failure') {
    // Initial failure, changed failure category or periodic reminder after cooldown.
    if (!last || last.state === 'recovery' || last.failedChecks.join(',') !== failedChecks.join(',') || now < last.at || now - last.at >= cooldownMs) transition = 'failure';
  } else if (last?.state === 'failure') transition = 'recovery';
  let delivery = { delivered: false, reason: transition ? 'not_configured' : 'not_due' };
  if (transition && typeof notify === 'function') {
    try {
      const result = await notify({ type: 'monitor_transition', state: transition, failedChecks, release: safeRelease(release) });
      delivery = result?.delivered === true ? { delivered: true } : { delivered: false, reason: 'not_configured' };
    } catch { delivery = { delivered: false, reason: 'delivery_failed' }; }
    // A failed attempt must remain retryable, including recovery after an outage.
    if (delivery.delivered) state.lastDelivered = { state: transition, at: now, failedChecks };
  }
  return { healthy: current === 'healthy', state, transition, delivery };
}
module.exports = { CHECKS, getMonitorConfig, cleanNotification, createWebhookNotifier, validateMonitorState, evaluateMonitor };
