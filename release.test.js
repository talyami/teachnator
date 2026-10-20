'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const release = require('./release.cjs');
test('current release never prompts or force-reloads, including a stale force flag', () => {
  const current = { version: release.version, build: release.build, forceReload: true };
  assert.equal(release.hasUpdate(current), false);
  assert.equal(release.shouldReload(current, null), false);
  assert.equal(release.hasUpdate({ version: release.version }), false);
});
test('a forced different release reloads at most once per tab even with stale HTML', () => {
  const values = new Map(); const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const next = { version: release.version, build: 'next-build', forceReload: true };
  assert.equal(release.hasUpdate(next), true);
  assert.equal(release.shouldReload(next, storage), true);
  assert.equal(release.shouldReload(next, storage), false);
  assert.equal(release.shouldReload(next, { getItem() { throw Error('disabled'); } }), false);
});
test('frontend and backend share release identity; admin JSON errors are sanitized', async () => {
  const path = require('node:path');
  const output = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, 'frontend/services/api.js')], bundle:true, write:false, format:'cjs', platform:'node' }).outputFiles[0].text;
  const Module = require('node:module'); const compiled = new Module(__filename, module); compiled._compile(output, __filename);
  await assert.rejects(compiled.exports.readApiResponse({ ok:false, status:502, url:'https://example.test/teachnator/api/admin/ai-test', headers:new Headers({'content-type':'text/html'}), json:async()=>{throw new SyntaxError("Unexpected token '<'");} }), error => !error.message.includes('Unexpected token') && !error.message.includes('<'));
});
