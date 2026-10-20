'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'auth-tests-only-secret';
process.env.GOOGLE_CLIENT_ID = 'configured-client';
process.env.JWT_ISSUER = 'fast-learning';
process.env.JWT_AUDIENCE = 'fast-learning-web';
let user = { id: 7, email: 'student@example.com', status: 'active', role: 'user', session_version: 0 };
let dbFailure = false, queries = 0;
const dbPath = require.resolve('./db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => {
  queries++; if (dbFailure) throw new Error('private SQL failure'); return user ? [{ ...user }] : [];
} } };
const { generateToken, authenticateToken, verifyGoogleToken, validateAuthConfiguration } = require('./auth');
async function authenticate(token, cookie) {
  const req = { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}) } };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  let next = false; await authenticateToken(req, res, () => { next = true; });
  return { req, res, next };
}
test('bearer sessions enforce issuer/audience/claims, fresh bans and revocation', async () => {
  const token = generateToken(user);
  assert.equal((await authenticate(token)).next, true);
  user.session_version++;
  assert.equal((await authenticate(token)).res.statusCode, 401);
  const fresh = generateToken(user);
  user.status = 'banned'; assert.equal((await authenticate(fresh)).res.statusCode, 403);
  user.status = 'active'; user.role = 'admin'; assert.equal((await authenticate(fresh)).req.user.role, 'admin');
  dbFailure = true; const failed = await authenticate(fresh);
  assert.equal(failed.res.statusCode, 503); assert.ok(!failed.res.body.message.includes('SQL'));
  dbFailure = false;
  for (const patch of [{ iss: 'evil' }, { sub: '9' }, { email: null }, { sessionVersion: undefined }, { exp: undefined }]) {
    const claims = { ...jwt.decode(fresh), ...patch };
    for (const key of Object.keys(claims)) if (claims[key] === undefined) delete claims[key];
    const forged = jwt.sign(claims, process.env.JWT_SECRET, { algorithm: 'HS256' });
    assert.equal((await authenticate(forged)).res.statusCode, 401);
  }
});
test('auth cookies are ignored, with no hidden fallback after bearer logout', async () => {
  const before = queries;
  const result = await authenticate(null, 'fl_auth=' + generateToken(user));
  assert.equal(result.next, true); assert.equal(result.req.user, null); assert.equal(queries, before);
});
test('Google requires exact audience, issuer, valid expiry/sub and verified email with timeout', async () => {
  const nativeFetch = global.fetch;
  const good = { aud: 'configured-client', iss: 'https://accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 60),
    sub: 'google-user-123', email: 'verified@example.com', email_verified: 'true' };
  try {
    for (const patch of [null, { iss: undefined }, { exp: undefined }, { exp: '1' }, { sub: undefined }, { email: 'bad' }, { email_verified: false }, { aud: 'wrong' }]) {
      global.fetch = async (url, options) => { assert.ok(options.signal); assert.equal(options.redirect, 'error');
        return { ok: true, json: async () => ({ ...good, ...patch }) }; };
      if (patch === null) assert.equal((await verifyGoogleToken('x'.repeat(30))).email, good.email);
      else await assert.rejects(verifyGoogleToken('x'.repeat(30)), { status: 401 });
    }
  } finally { global.fetch = nativeFetch; }
});
test('configuration validation is pure and missing Google configuration fails before network or startup', async () => {
  const good = Object.freeze({ JWT_SECRET: 'unit-test-secret', GOOGLE_CLIENT_ID: '  client-id  ' });
  assert.deepEqual(validateAuthConfiguration(good), { jwtSecret: 'unit-test-secret', googleClientId: 'client-id' });
  for (const env of [{}, { JWT_SECRET: 'test' }, { JWT_SECRET: 'test', GOOGLE_CLIENT_ID: ' ' }, { GOOGLE_CLIENT_ID: 'test' }]) assert.throws(() => validateAuthConfiguration(env), { status: 503 });
  const client = process.env.GOOGLE_CLIENT_ID, nativeFetch = global.fetch;
  try {
    delete process.env.GOOGLE_CLIENT_ID;
    global.fetch = () => { throw new Error('Network must not run'); };
    await assert.rejects(verifyGoogleToken('x'.repeat(30)), { status: 503 });
    assert.throws(() => generateToken(user), { status: 503 });
  } finally { process.env.GOOGLE_CLIENT_ID = client; global.fetch = nativeFetch; }
  const token = generateToken(user);
  try {
    delete process.env.GOOGLE_CLIENT_ID;
    assert.equal((await authenticate(token)).res.statusCode, 503);
  } finally { process.env.GOOGLE_CLIENT_ID = client; }
});
