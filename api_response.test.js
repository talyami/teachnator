'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
// Loading the app does not initialize or query the database.
process.env.JWT_SECRET ||= 'test-only-not-a-production-secret';
const { app } = require('./server');

test('API errors stay JSON on root and subpath routes', async () => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const prefix of ['/api', '/fast-learning/api']) {
      for (const [path, body, expectedStatus] of [
        ['/ai/generate', '{', 400],
        ['/missing', '{}', 404],
        ['/ai/generate', '{}', 400]
      ]) {
        const response = await fetch(base + prefix + path, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body
        });
        assert.equal(response.status, expectedStatus);
        assert.match(response.headers.get('content-type'), /application\/json/);
        const data = await response.json();
        assert.equal(data.success, false);
        assert.equal(typeof data.message, 'string');
        assert.ok(!JSON.stringify(data).includes('SyntaxError'));
      }
    }
    const response = await fetch(base + '/api/missing');
    assert.equal(response.status, 404);
    assert.equal((await response.json()).success, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
