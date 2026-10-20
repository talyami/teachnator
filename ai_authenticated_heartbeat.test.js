'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'heartbeat-tests-only-secret';
const auth = require('./auth');
auth.authenticateToken = (req, res, next) => { req.user = { id: 7, role: 'user' }; next(); };
const proxy = require('./ai_proxy');
let operation;
proxy.handleAiGenerate = () => operation();
const nativeSetInterval = global.setInterval;
global.setInterval = (fn, ms, ...args) => nativeSetInterval(fn, ms === 10000 ? 10 : ms, ...args);
const { app } = require('./server');
test('signed-in slow AI success/failure heartbeat remains parseable JSON', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const failed of [false, true]) {
      let finish;
      operation = () => new Promise((resolve, reject) => { finish = failed
        ? () => reject(Object.assign(new Error('Test timeout'), { status: 504 }))
        : () => resolve({ success: true, data: { answer: 'ok' } }); });
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ai/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'draft' })
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control'), /no-store/);
      const reader = response.body.getReader();
      const first = await reader.read();
      let text = new TextDecoder().decode(first.value);
      assert.match(text, /^\s+$/);
      const second = await reader.read();
      const heartbeat = new TextDecoder().decode(second.value);
      assert.match(heartbeat, /^\s+$/); text += heartbeat;
      finish();
      for (;;) { const chunk = await reader.read(); if (chunk.done) break; text += new TextDecoder().decode(chunk.value); }
      const result = JSON.parse(text);
      assert.equal(result.success, !failed);
      if (failed) assert.equal(result.message, 'Test timeout');
    }
  } finally {
    global.setInterval = nativeSetInterval;
    await new Promise(resolve => server.close(resolve));
  }
});
