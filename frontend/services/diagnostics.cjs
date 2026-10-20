'use strict';
const CODES = new Set(['CLIENT_RUNTIME_ERROR','CLIENT_UNHANDLED_REJECTION','CLIENT_RESOURCE_ERROR','CLIENT_RENDER_ERROR']);
const CODE_MAP = { runtime_error: 'CLIENT_RUNTIME_ERROR', unhandled_rejection: 'CLIENT_UNHANDLED_REJECTION', render_failed: 'CLIENT_RENDER_ERROR', progress_conflict: 'CLIENT_RESOURCE_ERROR', progress_save_failed: 'CLIENT_RESOURCE_ERROR', local_save_failed: 'CLIENT_RESOURCE_ERROR', audio_failed: 'CLIENT_RESOURCE_ERROR' };
function diagnosticPayload(code, source = '', line = 0) {
  code = CODE_MAP[code] || code;
  if (!CODES.has(code)) return null;
  let asset = '';
  try {
    const pathname = new URL(source, 'https://app.invalid/').pathname;
    const basename = pathname.slice(pathname.lastIndexOf('/') + 1);
    if (/^(?:app|policy|diagnostics)-[a-f0-9]{16}\.js$/.test(basename)) asset = basename;
  } catch (_) {}
  return { code, asset, line: asset && Number.isSafeInteger(line) && line > 0 && line < 10000000 ? line : 0 };
}
function endpoint(location) { return /^\/teachnator(?:\/|$)/.test(location.pathname) ? '/teachnator/api/client-errors' : '/api/client-errors'; }
const sent = new Map();
function reportClientError(code, source, line, host = globalThis.window) {
  const payload = diagnosticPayload(code, source, line);
  if (!payload || !host) return;
  const key = JSON.stringify(payload), now = Date.now();
  if (sent.has(key) && now - sent.get(key) < 60000) return;
  if (sent.size >= 32) return;
  sent.set(key, now);
  try {
    host.fetch(endpoint(host.location), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', keepalive: true, body: key }).catch(() => {});
  } catch (_) {}
}
function installDiagnostics(host) {
  if (host.__safeDiagnosticsInstalled) return;
  host.__safeDiagnosticsInstalled = true;
  host.addEventListener('error', event => {
    const resource = event.target && event.target !== host;
    reportClientError(resource ? 'CLIENT_RESOURCE_ERROR' : 'runtime_error', resource ? event.target.src || event.target.href || '' : event.filename, resource ? 0 : event.lineno, host);
  }, true);
  host.addEventListener('unhandledrejection', () => reportClientError('unhandled_rejection', '', 0, host));
}
module.exports = { diagnosticPayload, reportClientError, installDiagnostics };
