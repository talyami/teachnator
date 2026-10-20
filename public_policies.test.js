'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET ||= 'policies-offline-test-secret';
process.env.MONITOR_WEBHOOK_URL = '';
const auth = require('./auth');
let authCalls = 0;
auth.authenticateToken = (_req, res) => { authCalls++; res.status(401).json({ success: false }); };
const { app } = require('./server');
async function serve(work) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await work(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
test('public bilingual policies work at both prefixes even with invalid bearer tokens', async () => serve(async base => {
  authCalls = 0;
  for (const prefix of ['', '/teachnator']) for (const page of ['privacy', 'terms', 'contact']) {
    const response = await fetch(`${base}${prefix}/${page}?lang=en`, { headers: { Authorization: 'Bearer obsolete' } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const html = await response.text();
    assert.match(html, /lang="ar"/); assert.match(html, /lang="en"/);
    assert.ok(html.includes(`href="${prefix}/privacy"`));
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  assert.equal(authCalls, 0);
}));
test('client diagnostics require permitted origin, small body and validated code before auth', async () => serve(async base => {
  const send = async (body, origin) => fetch(base + '/teachnator/api/client-errors', { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  assert.equal((await send({ code: 'CLIENT_RUNTIME_ERROR' })).status, 403);
  assert.equal((await send({ code: 'CLIENT_RUNTIME_ERROR' }, 'https://evil.example')).status, 403);
  assert.equal((await send({ code: 'arbitrary' }, 'https://villa.linkflow.page')).status, 400);
  const accepted = await send({ code: 'CLIENT_RUNTIME_ERROR', message: 'NEVER_LOG_PRIVATE_STUDY_DATA', stack: 'PRIVATE_TOKEN' }, 'https://villa.linkflow.page');
  assert.equal(accepted.status, 204); assert.equal(await accepted.text(), '');
  assert.equal((await send({ code: 'render_failed', source: 'private-study.txt', message: 'DROP_PRIVATE_CONTENT' }, 'https://villa.linkflow.page')).status, 204);
  assert.equal((await send({ code: 'CLIENT_RUNTIME_ERROR', message: 'x'.repeat(9000) }, 'https://villa.linkflow.page')).status, 413);
}));
