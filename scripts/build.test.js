'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { extractFrontend, assertProductionHtml, build } = require('./build');

test('build replaces runtime compilers/CDNs and externalizes executable policy', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fl-build-test-'));
  try {
    const { html, inputs } = await build({ outDir: directory });
    for (const name of ['App.jsx', 'views/UploadView.jsx', 'views/LearnView.jsx', 'views/QuizView.jsx', 'views/ResultView.jsx', 'views/AdminView.jsx', 'views/SettingsView.jsx', 'domain/study.cjs', 'services/progress.cjs']) assert.ok(inputs.some(input => input.replaceAll('\\\\', '/').endsWith(name)), name);
    assert.match(html, /src="\.\/assets\/diagnostics-[a-f0-9]+\.js"/);
    assertProductionHtml(html);
    assert.match(html, /accounts\.google\.com\/gsi\/client/);
    assert.match(html, /src="\.\/assets\/policy-[a-f0-9]+\.js"/);
    assert.match(html, /src="\.\/assets\/app-[a-f0-9]+\.js"/);
    assert.match(html, /href="\.\/assets\/app-[a-f0-9]+\.css"/);
    assert.doesNotMatch(html, /<style\b/);
    for (const [, url] of html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)) {
      await fs.access(path.join(directory, url));
      assert.equal(new URL(url, 'https://example.test/teachnator/').pathname.startsWith('/teachnator/assets/'), true);
    }
    const policyName = html.match(/src="\.\/assets\/(policy-[a-f0-9]+\.js)"/)[1];
    assert.match(await fs.readFile(path.join(directory, 'assets', policyName), 'utf8'), /AI_ONLY_NO_ROBOT/);
    const cssName = html.match(/href="\.\/assets\/(app-[a-f0-9]+\.css)"/)[1];
    const css = await fs.readFile(path.join(directory, 'assets', cssName), 'utf8');
    assert.match(css, /\.study-header/);
    assert.match(css, /\.bg-indigo-600/);
    assert.match(css, /\.shadow-xs/);
    assert.match(css, /fa-arrow-right/);
    const appName = html.match(/src="\.\/assets\/(app-[a-f0-9]+\.js)"/)[1];
    assert.doesNotMatch(await fs.readFile(path.join(directory, 'assets', appName), 'utf8'), /srv875806|tail759794|combo-gemini-flash|revisionWarning/);
    const diagnosticsName = html.match(/src="\.\/assets\/(diagnostics-[a-f0-9]+\.js)"/)[1];
    assert.ok(html.indexOf(diagnosticsName) < html.indexOf(appName));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('production checks reject development and inline scripts', () => {
  assert.throws(() => assertProductionHtml('<script>alert(1)</script>'), /inline/);
  assert.throws(() => assertProductionHtml('<script src="https://unpkg.com/react"></script>'), /dependency/);
  assert.throws(() => extractFrontend('<html></html>'), /exactly one/);
});
