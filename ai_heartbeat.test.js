'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET ||= 'test-only-secret';
// Stub the upstream operation: no DB, credentials, or paid provider requests.
const proxy = require('./ai_proxy');
let operation;
proxy.handleAiGenerate = () => operation();
const nativeSetInterval = global.setInterval;
global.setInterval = (fn, ms, ...args) => nativeSetInterval(fn, ms === 10000 ? 10 : ms, ...args);
const { app } = require('./server');

test('slow AI responses heartbeat and remain parseable JSON on success/error', async () => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const failed of [false, true]) {
      let finish;
      operation = () => new Promise((resolve, reject) => { finish = failed
        ? () => reject(Object.assign(new Error('Test timeout'), {status:504}))
        : () => resolve({success:true,data:{answer:'ok'}}); });
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ai/generate`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /application\/json/);
      assert.match(response.headers.get('cache-control'), /no-store/);
      const reader = response.body.getReader();
      const first = await reader.read();
      const heartbeat = new TextDecoder().decode(first.value);
      assert.match(heartbeat, /^\s+$/);
      // Read a second heartbeat to catch attempts to change headers after flush.
      const second = await reader.read();
      const nextHeartbeat = new TextDecoder().decode(second.value);
      assert.match(nextHeartbeat, /^\s+$/);
      finish();
      let text = heartbeat + nextHeartbeat;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += new TextDecoder().decode(chunk.value);
      }
      const data = JSON.parse(text);
      assert.equal(data.success, !failed);
      if (failed) assert.equal(data.message, 'Test timeout');
    }
  } finally {
    global.setInterval = nativeSetInterval;
    await new Promise(resolve => server.close(resolve));
  }
});
