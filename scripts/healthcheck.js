'use strict';
// Read-only HTTP probe; imports never load environment files or connect to a DB.
async function probe(url = process.env.HEALTHCHECK_URL || 'http://127.0.0.1:3025/api/ready', { fetchImpl = global.fetch, now = Date.now, quiet = false } = {}) {
  const started = now();
  let response;
  try { response = await fetchImpl(url, { signal: AbortSignal.timeout(5000), redirect: 'error' }); }
  catch { throw new Error('Health probe connection failed.'); }
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new Error(`Health probe failed: HTTP ${response.status}`); }
  if (!/application\/json/i.test(response.headers.get('content-type') || '')) { await response.body?.cancel().catch(() => {}); throw new Error('Health probe expected JSON, not an HTML fallback.'); }
  let body;
  try { body = await response.json(); } catch { throw new Error('Health probe returned invalid JSON.'); }
  if (!body || body.success === false || ['unhealthy', 'unavailable', 'failed', 'error'].includes(body.status) || body.database === false || body.database === 'disconnected') throw new Error('Health endpoint reports an unhealthy dependency.');
  if (body.success !== true && !['ok', 'healthy', 'ready'].includes(body.status)) throw new Error('Health endpoint did not provide an explicit healthy status.');
  if (!quiet) console.info('Health probe passed.');
  return { healthy: true, durationMs: Math.max(0, now() - started), status: response.status };
}
if (require.main === module) {
  require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env'), quiet: true });
  probe().catch(() => { console.error('HEALTHCHECK_FAILED'); process.exitCode = 1; });
}
module.exports = { probe };
