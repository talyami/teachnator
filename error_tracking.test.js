'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createErrorTracker, createReportLimiter, createNotificationGate } = require('./error_tracking');
test('tracker emits allowlisted structured JSON only and owns client release', () => {
  const lines = [], remote = [];
  const tracker = createErrorTracker({ release: 'release.12', logger: line => lines.push(line), notify: event => remote.push(event), assets: ['app-abcdef12.js'] });
  const hostile = { code: 'CLIENT_RUNTIME_ERROR', source: 'server', release: 'stolen-token', route: '/api/materials/123?email=x@y.com', message: 'secret password', stack: 'doc text', headers: { authorization: 'Bearer secret' }, cookies: 'secret', ip: '127.0.0.1', email: 'x@y.com', asset: 'https://secret.example/app.js?token=x', line: 2, column: 3 };
  assert.deepEqual(tracker.captureClient(hostile, { rateKey: '127.0.0.1' }), { accepted: true });
  assert.deepEqual(JSON.parse(lines[0]), { type: 'application_error', timestamp: JSON.parse(lines[0]).timestamp, source: 'client', code: 'CLIENT_RUNTIME_ERROR', release: 'release.12' });
  tracker.captureServer({ ...hostile, code: 'DB_UNAVAILABLE', route: '/api/materials/:id', status: 503, asset: 'app-abcdef12.js', line: 200, column: -1 });
  const server = JSON.parse(lines[1]);
  assert.equal(server.source, 'server'); assert.equal(server.route, '/api/materials/:id'); assert.equal(server.status, 503); assert.equal(server.line, 200); assert.equal(server.column, undefined);
  assert.doesNotMatch(JSON.stringify({ lines, remote }), /secret|doc text|password|127\.0\.0\.1|x@y.com|stolen-token/);
});
test('malformed client reports and per-key/global floods are rejected in bounded windows', () => {
  let time = 1000;
  const limiter = createReportLimiter({ now: () => time, perKey: 2, globalLimit: 3, maxKeys: 2, windowMs: 100 });
  assert.equal(limiter.allow('a'), true); assert.equal(limiter.allow('a'), true); assert.equal(limiter.allow('a'), false);
  assert.equal(limiter.allow('b'), true); assert.equal(limiter.allow('c'), false);
  time += 100; assert.equal(limiter.allow('c'), true);
  const tracker = createErrorTracker({ logger: () => {}, limiter: { allow: () => true } });
  for (const body of [null, [], 'secret', { code: 'INTERNAL_ERROR' }, { code: 'private-message' }]) assert.equal(tracker.captureClient(body).reason, 'invalid_report');
  assert.equal(createErrorTracker({ limiter: { allow: () => false } }).captureClient({ code: 'CLIENT_RUNTIME_ERROR' }).reason, 'rate_limited');
});
test('repeated runtime reports are deduplicated and global notifications are attempt-throttled', async () => {
  let time = 1000; const sent = [], lines = [];
  const notificationGate = createNotificationGate({ now: () => time, dedupeMs: 500, windowMs: 100, globalLimit: 2, maxKeys: 3 });
  const tracker = createErrorTracker({ now: () => time, notificationGate, logger: line => lines.push(line), notify: async event => { sent.push(event); throw new Error('private receiver token'); }, limiter: { allow: () => true } });
  tracker.captureServer({ code: 'DB_UNAVAILABLE' });
  for (let index = 0; index < 30; index++) tracker.captureServer({ code: 'DB_UNAVAILABLE', line: index, status: 500 + index });
  tracker.captureClient({ code: 'CLIENT_RUNTIME_ERROR', route: '/', line: 20 });
  tracker.captureServer({ code: 'AI_UPSTREAM_FAILURE' });
  assert.equal(sent.length, 2); assert.equal(lines.length, 33);
  time += 100;
  tracker.captureServer({ code: 'AI_UPSTREAM_FAILURE' }); assert.equal(sent.length, 3);
  tracker.captureServer({ code: 'DB_UNAVAILABLE' }); assert.equal(sent.length, 3);
  time += 500;
  tracker.captureServer({ code: 'DB_UNAVAILABLE' }); assert.equal(sent.length, 4);
  await new Promise(resolve => setImmediate(resolve));
  assert.doesNotMatch(JSON.stringify({ sent, lines }), /private|receiver|token/);
});
test('logging and asynchronous notification failures never break application flow', async () => {
  const tracker = createErrorTracker({ release: 'bad\nrelease', logger: () => { throw new Error('secret'); }, notify: async () => { throw new Error('secret webhook URL'); } });
  assert.equal(tracker.captureServer(new Error('secret user message')).code, 'INTERNAL_ERROR');
  assert.equal(tracker.captureServer({}).release, 'unknown');
  await new Promise(resolve => setImmediate(resolve));
});
