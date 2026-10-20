'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET ||= 'test-only-secret';
let upstreamCalls = 0;
require('./ai_proxy').handleAiGenerate = async () => { upstreamCalls++; return { success: true }; };
const { app } = require('./server');

test('anonymous requests are rejected before opening an AI heartbeat stream', async () => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const prefix of ['/api', '/teachnator/api', '/fast-learning/api']) {
      const response = await fetch(base + prefix + '/ai/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: 'brain', operation: 'draft', isDemo: true })
      });
      assert.equal(response.status, 401);
      assert.match(response.headers.get('content-type'), /application\/json/);
      assert.equal((await response.json()).success, false);
    }
    assert.equal(upstreamCalls, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
