'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { probe } = require('./healthcheck');
test('readiness probe rejects HTML, unavailable DB and unspecified JSON status', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } });
    await assert.rejects(probe(), /expected JSON/);
    global.fetch = async () => Response.json({ status: 'ok', database: false });
    await assert.rejects(probe(), /unhealthy dependency/);
    global.fetch = async () => Response.json({ success: true, status: 'unavailable' });
    await assert.rejects(probe(), /unhealthy dependency/);
    global.fetch = async () => { throw new Error('PRIVATE_URL_TOKEN'); };
    await assert.rejects(probe(), error => !error.message.includes('PRIVATE_URL_TOKEN'));
    global.fetch = async () => Response.json({});
    await assert.rejects(probe(), /explicit healthy/);
    global.fetch = async () => Response.json({ status: 'ok', database: true });
    await probe();
  } finally { global.fetch = original; }
});
