'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getPublicLegalConfig, renderLegalPage, legalPageHandler, normalizeBasePath } = require('./legal_pages');
test('public legal settings are explicitly unconfigured and never expose private env', () => {
  const config = getPublicLegalConfig({ JWT_SECRET: 'hidden', MONITOR_WEBHOOK_URL: 'https://secret.example/token' });
  assert.equal(config.operator.name, null);
  assert.equal(config.support.email, null);
  assert.equal(config.policy.ownerReviewed, false);
  assert.doesNotMatch(JSON.stringify(config), /hidden|secret.example/);
  for (const page of ['privacy', 'terms', 'contact']) {
    const html = renderLegalPage(page, { env: {} });
    assert.match(html, /Not configured/);
    assert.match(html, /lang="en"/);
    assert.match(html, /lang="ar"/);
    assert.match(html, /not legal certification|has not been recorded/);
    assert.doesNotMatch(html, /<script|refund|استرداد|SLA|GDPR compliant/i);
  }
});
test('operator values are escaped and public contact links are strictly validated', () => {
  const env = { LEGAL_OPERATOR_NAME: '<img src=x onerror=alert(1)>', LEGAL_OPERATOR_ADDRESS: '\"<script>bad</script>', SUPPORT_EMAIL: 'help+privacy@example.com', PUBLIC_SUPPORT_URL: 'https://support.example/help', SUPPORT_WHATSAPP: '+966500000000', LEGAL_POLICY_REVIEWED: 'true', LEGAL_REVIEWED_AT: '2026-02-30' };
  const html = renderLegalPage('contact', { env, basePath: '/teachnator' });
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img/);
  assert.match(html, /mailto:help\+privacy@example.com/);
  assert.match(html, /href="\/teachnator\/privacy"/);
  assert.match(html, /https:\/\/wa.me\/966500000000/);
  assert.equal(getPublicLegalConfig(env).policy.reviewedAt, null);
  for (const url of ['javascript:alert(1)', 'http://example.com', 'https://name:pass@example.com', 'https://example.com/?token=secret', 'https://example.com/#secret']) assert.equal(getPublicLegalConfig({ PUBLIC_SUPPORT_URL: url }).support.url, null);
  for (const email of ['a@example.com\r\nBcc:x@y.com', '" onclick="x@example.com', 'not-email', 'a?subject=private@example.com', 'a%0ABcc@example.com', 'a#header@example.com', 'a&bcc=other@example.com', 'a@bad..example.com', '.a@example.com']) assert.equal(getPublicLegalConfig({ SUPPORT_EMAIL: email }).support.email, null);
  assert.throws(() => normalizeBasePath('//evil.example'), /Invalid/);
  assert.throws(() => normalizeBasePath('/x?secret'), /Invalid/);
});
test('actual provider disclosures are explicitly public, configurable and escaped', () => {
  const env = { LEGAL_AI_PROVIDER: 'Reviewed gateway <AI> & downstream vendor', LEGAL_SPEECH_PROVIDER: 'Provider selected by operator', LEGAL_PROCESSING_LOCATIONS: 'Regions not guaranteed', SERVER_BRAIN_URL: 'https://private.example/token', SERVER_BRAIN_API_KEY: 'private-key', MONITOR_WEBHOOK_URL: 'https://private.example/hook' };
  const config = getPublicLegalConfig(env);
  assert.equal(config.providers.ai, env.LEGAL_AI_PROVIDER);
  const html = renderLegalPage('privacy', { env });
  assert.match(html, /Reviewed gateway &lt;AI&gt; &amp; downstream vendor/);
  assert.match(html, /Not disclosed/);
  assert.match(html, /not automatic verification/);
  assert.doesNotMatch(html, /private-key|private.example|<AI>/);
});
test('legal handler is public HTML no-store and policy shows effective retention settings', () => {
  const response = { headers: {}, set(key, value) { this.headers[key] = value; }, type(value) { this.mime = value; return this; }, send(html) { this.html = html; return this; } };
  legalPageHandler('privacy', { env: { TTS_CACHE_RETENTION_DAYS: '14', AI_USAGE_RETENTION_DAYS: '60' } })({}, response);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.mime, 'html');
  assert.match(response.html, /14 days/);
  assert.match(response.html, /60 days/);
  assert.match(response.html, /do not prove that scheduling is active/);
});
