'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
process.env.JWT_SECRET ||= 'static-route-test-secret';
const { app } = require('./server');

test('production static routes serve only compiled assets on root and subpath', async () => {
  await require('./scripts/build').build();
  const html = await fs.readFile(path.join(__dirname, 'dist/index.html'), 'utf8');
  const asset = html.match(/src="\.\/(assets\/app-[a-f0-9]+\.js)"/)[1];
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const prefix of ['', '/teachnator']) {
      const page = await fetch(base + prefix + '/');
      assert.equal(page.status, 200);
      assert.match(page.headers.get('cache-control'), /no-store/);
      const markup = await page.text();
      assert.doesNotMatch(markup, /text\/babel|cdn.tailwindcss.com|unpkg.com/);
      const js = await fetch(base + prefix + '/' + asset);
      assert.equal(js.status, 200);
      assert.match(js.headers.get('content-type'), /javascript/);
      assert.match(js.headers.get('cache-control'), /immutable/);
      await js.body.cancel();
      for (const privatePath of ['.env', 'server.js', 'backups/working-tree-20261018.zip', 'assets/missing.js']) {
        const missing = await fetch(base + prefix + '/' + privatePath);
        assert.equal(missing.status, 404, privatePath);
        assert.doesNotMatch(await missing.text(), /<html|JWT_SECRET|express =/);
      }
    }
    const redirect = await fetch(base + '/teachnator', { redirect: 'manual' });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), '/teachnator/');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
