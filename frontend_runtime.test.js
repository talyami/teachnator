'use strict';
// Mount the real modular entry point, not extracted helper strings or a React mock.
// No server, database, browser automation, external SDK or provider is contacted.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: nextTurn, setTimeout: delay } = require('node:timers/promises');
const { MessageChannel } = require('node:worker_threads');
const esbuild = require('esbuild');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const { createRun } = require('./frontend/domain/study.cjs');
const { updateTimer } = require('./frontend/domain/timer.cjs');

const APP_URL = 'https://villa.linkflow.page/teachnator/';
const VERSION = { version: require('./release.cjs').version, build: require('./release.cjs').build, forceReload: false };
const ADMIN = { id: 41, name: 'Runtime Admin', email: 'admin@example.invalid', role: 'admin', auth_provider: 'google', has_server_ai_access: 1, material_limit: null, materials_used: 0 };
const STUDENT = { id: 42, name: 'Runtime Student', email: 'student@example.invalid', role: 'user', auth_provider: 'google', has_server_ai_access: 1, material_limit: 5, materials_used: 1 };
const MATERIAL = { id: 71, title: 'Offline saved lesson', question_count: 2, created_at: '2026-10-20T08:00:00.000Z' };

let bundlePromise;
function runtimeBundle() {
  // act and the app must share the SAME bundled React instance. Importing act in
  // Node would create a second React realm and fail to flush the mounted app.
  bundlePromise ||= esbuild.build({
    absWorkingDir: __dirname,
    stdin: {
      contents: "import { act } from 'react'; window.__runtimeTest = { act, roots: [], boot: () => import('./frontend/main.jsx') };",
      resolveDir: __dirname, sourcefile: 'frontend-runtime-harness.jsx', loader: 'jsx'
    },
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020',
    plugins: [{
      name: 'track-real-react-roots',
      setup(build) {
        build.onResolve({ filter: /^react-dom\/client$/ }, () => ({ path: 'react-dom/client', namespace: 'runtime-root-tracking' }));
        build.onLoad({ filter: /.*/, namespace: 'runtime-root-tracking' }, () => ({
          // Delegate every call to the real ReactDOM root. Recording the public
          // root lets teardown unmount via act instead of merely closing jsdom.
          contents: `import { createRoot as realCreateRoot } from ${JSON.stringify(require.resolve('react-dom/client'))}; export function createRoot(...args) { const root = realCreateRoot(...args); window.__runtimeTest.roots.push(root); return root; }`,
          resolveDir: __dirname, loader: 'js'
        }));
      }
    }],
    define: { 'process.env.NODE_ENV': '"development"' },
    sourcemap: 'inline', outfile: 'frontend-runtime-test.js', logLevel: 'silent'
  }).then(result => result.outputFiles.find(file => file.path.endsWith('.js')).text);
  return bundlePromise;
}

function describeError(value) {
  return value?.stack || value?.message || String(value);
}
function readableName(element) {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) return labelledBy.split(/\s+/).map(id => element.ownerDocument.getElementById(id)?.textContent || '').join(' ').trim();
  const text = element.matches('input, textarea, select') ? '' : element.textContent;
  return (element.getAttribute('aria-label') || [...(element.labels || [])].map(label => label.textContent).join(' ') || text || element.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
}
function assertNamed(element, description) {
  assert.ok(element, `${description} must be rendered`);
  assert.ok(readableName(element), `${description} needs an associated label, aria-label or aria-labelledby (placeholder alone is not a label)`);
}
function assertSameNode(actual, expected, description) {
  // assert.equal would try to format two huge jsdom/React object graphs on
  // failure, blocking the runner before it can report a simple focus failure.
  // Compare the same identities without constructing a DOM object diff.
  assert.ok(actual === expected, `${description} (actual: ${actual?.tagName || 'none'}, expected: ${expected?.tagName || 'none'})`);
}

function installBrowserPrimitives(window) {
  // Only browser facilities absent in jsdom are replaced; app code, React,
  // reconciliation, hooks, event handlers and the error boundary remain real.
  const noop = () => {};
  const messagePorts = [];
  window.MessageChannel = class extends MessageChannel {
    constructor() { super(); messagePorts.push(this.port1, this.port2); }
  };
  const parameter = () => ({ value: 0, setValueAtTime: noop, linearRampToValueAtTime: noop, exponentialRampToValueAtTime: noop, setTargetAtTime: noop, cancelScheduledValues: noop });
  const audioNode = () => ({ connect: noop, disconnect: noop, start: noop, stop: noop, gain: parameter(), frequency: parameter(), pan: parameter(), delayTime: parameter(), Q: parameter() });
  class OfflineAudioContext {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = audioNode(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createGain() { return audioNode(); }
    createOscillator() { return audioNode(); }
    createBufferSource() { return audioNode(); }
    createStereoPanner() { return audioNode(); }
    createDelay() { return audioNode(); }
    createBiquadFilter() { return audioNode(); }
    createBuffer(channels, length, sampleRate) { return { length, numberOfChannels: channels, duration: length / sampleRate, sampleRate, getChannelData: () => new Float32Array(length) }; }
    decodeAudioData() { return Promise.resolve(this.createBuffer(1, 1, 8000)); }
  }
  window.AudioContext = window.webkitAudioContext = OfflineAudioContext;
  window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  window.HTMLMediaElement.prototype.pause = noop;
  window.HTMLMediaElement.prototype.load = noop;
  window.speechSynthesis = { cancel: noop, pause: noop, resume: noop, speak: noop, getVoices: () => [], addEventListener: noop, removeEventListener: noop };
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  let objectUrl = 0;
  window.URL.createObjectURL = () => `blob:${APP_URL}${++objectUrl}`;
  window.URL.revokeObjectURL = noop;
  window.requestAnimationFrame = callback => window.setTimeout(() => callback(window.performance.now()), 16);
  window.cancelAnimationFrame = id => window.clearTimeout(id);
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = query => ({ matches: false, media: query, addListener: noop, removeListener: noop, addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true });
  window.scrollTo = noop;
  window.HTMLElement.prototype.scrollIntoView = noop;
  window.HTMLCanvasElement.prototype.getContext = function (kind) {
    if (kind !== '2d') return null;
    return { canvas: this, clearRect: noop, fillRect: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, ellipse: noop, rect: noop, fill: noop, stroke: noop, save: noop, restore: noop, translate: noop, rotate: noop, scale: noop, setTransform: noop, bezierCurveTo: noop, quadraticCurveTo: noop };
  };
  window.IS_REACT_ACT_ENVIRONMENT = true;
  return () => messagePorts.forEach(port => port.close());
}

async function mountApp(t, { user = null, language = 'en', savedGuest = null, versionResponse = () => VERSION } = {}) {
  const source = await runtimeBundle();
  const errors = [];
  const consoleErrors = [];
  const diagnostics = [];
  const requests = [];
  const unexpected = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(describeError(error.detail || error)));
  virtualConsole.on('error', (...args) => consoleErrors.push(args.map(describeError).join(' ')));
  class OfflineResources extends ResourceLoader {
    fetch(url) { unexpected.push(`external resource: ${url}`); return null; }
  }
  const dom = new JSDOM('<!doctype html><html lang="en" dir="ltr"><head><title>Runtime test</title></head><body><div id="root"></div></body></html>', {
    url: APP_URL, runScripts: 'outside-only', pretendToBeVisual: true,
    resources: new OfflineResources(), virtualConsole
  });
  const { window } = dom;
  const disposeBrowserPrimitives = installBrowserPrimitives(window);
  t.after(async () => {
    try {
      if (window.__runtimeTest?.roots.length) {
        await window.__runtimeTest.act(async () => {
          window.__runtimeTest.roots.forEach(root => root.unmount());
          await nextTurn();
        });
      }
    } finally { disposeBrowserPrimitives(); window.close(); }
  });
  window.localStorage.setItem('fl_ui_language', language);
  window.localStorage.setItem('voice_narrator_enabled', 'false');
  window.localStorage.setItem('pink_noise_enabled', 'false');
  if (savedGuest) window.localStorage.setItem('smartExamGuestMaterial.v1', JSON.stringify(savedGuest));
  if (user) window.localStorage.setItem('auth_token', `offline.${Buffer.from(JSON.stringify({ id: user.id })).toString('base64url')}.signature`);
  window.addEventListener('error', event => errors.push(describeError(event.error || event.message)));
  window.addEventListener('unhandledrejection', event => errors.push(`Unhandled rejection: ${describeError(event.reason)}`));
  // All transports are local stubs. Unknown endpoints are recorded as failures,
  // not silently answered with {} (which can hide incorrect API contracts).
  window.XMLHttpRequest = class { open(method, url) { unexpected.push(`XMLHttpRequest: ${method} ${url}`); throw new Error('Network disabled in frontend runtime tests'); } };
  window.WebSocket = class { constructor(url) { unexpected.push(`WebSocket: ${url}`); throw new Error('Network disabled in frontend runtime tests'); } };
  Object.defineProperty(window.navigator, 'sendBeacon', { configurable: true, value: url => { unexpected.push(`sendBeacon: ${url}`); return false; } });
  const quota = { materialLimit: user ? null : 0, materialsUsed: 0, remaining: user ? null : 0, canGenerate: Boolean(user), pendingGenerationId: null };
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, APP_URL);
    const method = (options.method || 'GET').toUpperCase();
    requests.push({ path: url.pathname, method, body: options.body });
    let data;
    let status = 200;
    const route = url.pathname.replace(/^\/teachnator/, '');
    if (url.origin !== new URL(APP_URL).origin || !url.pathname.startsWith('/teachnator/')) {
      unexpected.push(`fetch outside deployment base: ${method} ${url}`);
      status = 501; data = { success: false, message: 'Unexpected offline request' };
    } else if (route === '/api/client-errors' && method === 'POST') {
      try { diagnostics.push(JSON.parse(options.body)); } catch (_) { diagnostics.push({ code: 'malformed_diagnostic' }); }
      data = { success: true };
    } else if (method === 'GET' && route === '/api/config') data = { googleClientId: '' };
    else if (method === 'GET' && route === '/api/version') data = versionResponse();
    else if (method === 'GET' && route === '/api/auth/me') data = { authenticated: Boolean(user), user };
    else if (method === 'GET' && route === '/api/billing/packs') data = { success: true, enabled: false, paymentsEnabled: false, supportEmail: 'support@example.invalid', packs: [] };
    else if (method === 'GET' && route === '/api/material-quota') data = { success: true, quota };
    else if (method === 'GET' && route === '/api/materials') data = { success: true, materials: [MATERIAL] };
    else if (method === 'GET' && route === '/api/admin/stats') data = { success: true, stats: { totalUsers: 2, serverAiUsers: 2, totalAiCalls: 0, totalMaterials: 1 } };
    else if (method === 'GET' && route === '/api/admin/users') data = { success: true, users: [ADMIN, STUDENT] };
    else if (method === 'GET' && route === '/api/admin/ai-settings') data = { success: true, settings: { server_brain_url: 'https://offline.example.invalid/v1', server_brain_model: 'offline-model', server_brain_api_key: '', server_vertex_config: { project: '', region: 'global', key: '' } } };
    else if (method === 'POST' && route === '/api/ai/generate' && JSON.parse(options.body || '{}').purpose === 'tts') {
      // Forced hint narration can run even when the narrator preference is off.
      // This is a local empty-audio response, never an AI/provider request.
      data = { success: true, data: { candidates: [] } };
    } else {
      unexpected.push(`unmocked request: ${method} ${url.pathname}`);
      status = 501; data = { success: false, message: 'Unexpected offline request' };
    }
    return { ok: status >= 200 && status < 300, status, url: url.href, headers: new window.Headers({ 'Content-Type': 'application/json' }), json: async () => JSON.parse(JSON.stringify(data)), text: async () => JSON.stringify(data) };
  };
  // jsdom does not supply Fetch classes; a genuine Headers implementation is
  // sufficient for the response contract without enabling Node's real fetch.
  window.Headers = globalThis.Headers;
  const app = {
    window, document: window.document, requests, diagnostics,
    assertHealthy(stage) {
      const fatalDiagnostics = diagnostics.filter(item => ['CLIENT_RENDER_ERROR', 'CLIENT_RUNTIME_ERROR', 'CLIENT_UNHANDLED_REJECTION', 'render_failed', 'runtime_error', 'unhandled_rejection', 'malformed_diagnostic'].includes(item.code));
      const boundary = /Unable to display the app|تعذر عرض التطبيق/.test(window.document.getElementById('root')?.textContent || '');
      assert.ok(!errors.length && !consoleErrors.length && !fatalDiagnostics.length && !boundary && !unexpected.length,
        `${stage}: mounted frontend failed\n${[...new Set([...errors, ...consoleErrors])].join('\n')}\nDiagnostics: ${JSON.stringify(fatalDiagnostics)}\nUnexpected network: ${JSON.stringify(unexpected)}${boundary ? '\nAppBoundary fallback rendered.' : ''}`);
    },
    async act(callback = () => {}) {
      await window.__runtimeTest.act(async () => {
        await callback();
        await nextTurn();
        await nextTurn();
      });
      // Effects focus a new route heading on the next animation frame. Let
      // that frame finish before the next user action, rather than typing
      // before the rendered screen has reached the browser's next paint.
      // Focus is still asserted after every fill; it is never patched here.
      await window.__runtimeTest.act(async () => {
        await new Promise(resolve => window.requestAnimationFrame(resolve));
      });
    },
    async waitFor(predicate, description) {
      const deadline = Date.now() + 2500;
      do {
        await app.act();
        app.assertHealthy(description);
        const result = predicate();
        if (result) return result;
        await delay(5);
      } while (Date.now() < deadline);
      assert.fail(`${description}: not rendered; DOM text: ${window.document.body.textContent.slice(0, 1600)}`);
    },
    button(name, scope = window.document) {
      const matches = [...scope.querySelectorAll('button, [role="button"]')].filter(element => {
        const actual = readableName(element);
        return typeof name === 'string' ? actual === name : name.test(actual);
      });
      assert.equal(matches.length, 1, `Expected one button named ${name}; found ${matches.length}. Buttons: ${[...scope.querySelectorAll('button')].map(readableName).join(' | ')}`);
      return matches[0];
    },
    async click(element, stage) {
      assert.ok(element && element.isConnected, `${stage}: target must be mounted`);
      assert.ok(!element.disabled, `${stage}: target must be enabled`);
      await app.act(() => { element.focus(); element.click(); });
      app.assertHealthy(stage);
    },
    async fill(element, value, stage) {
      const prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      await app.act(() => {
        element.focus();
        setter.call(element, value);
        element.dispatchEvent(new window.Event('input', { bubbles: true }));
        element.dispatchEvent(new window.Event('change', { bubbles: true }));
      });
      app.assertHealthy(stage);
      assert.equal(element.value, value, `${stage}: controlled value must survive render`);
      assert.ok(element.isConnected, `${stage}: input DOM identity must survive a controlled rerender`);
      assertSameNode(window.document.activeElement, element, `${stage}: typing must preserve focus`);
    },
    async escape(stage) {
      await app.act(() => window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
      app.assertHealthy(stage);
    }
  };
  window.eval(`${source}\n//# sourceURL=frontend-runtime-test.js`);
  await app.act(() => window.__runtimeTest.boot());
  await app.waitFor(() => window.document.querySelector('header'), 'initial app render');
  return app;
}

async function enterUpload(app) {
  const input = app.document.querySelector('form input[type="text"]');
  assert.ok(input, 'Setup name input must render');
  await app.fill(input, 'Offline Learner', 'setup name entry');
  await app.act(() => input.form.dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true })));
  app.assertHealthy('setup -> upload');
  await app.waitFor(() => app.document.querySelector('input[type="file"]'), 'upload screen');
}
async function enterDemo(app) {
  await enterUpload(app);
  await app.click(app.button(/No file right now\? Try a quick sample quiz/), 'upload -> demo intro');
  await app.waitFor(() => app.document.querySelector('[role="timer"]'), 'demo intro');
}

function savedGuestRun(mode, question, { legacy = false } = {}) {
  // Exercise the supported persisted-workspace entry too, so an upload failure
  // cannot prevent coverage of LearnView/QuizView/ResultView independently.
  const run = createRun({ owner: 'guest', materialKey: 'offline-saved-material', mode: mode === 'result' ? 'quiz' : mode, questions: [question], runId: `offline-${mode}-run` });
  run.timer = updateTimer(run.timer, { running: false });
  if (mode === 'result') { run.completed = true; run.currentIndex = run.queue.length; run.score = run.queue.length; }
  return { owner: 'guest', playerName: 'Offline Learner', mode, materialId: null, generationId: run.materialKey, questionsData: run.originalQuestions, allOriginalQuestions: run.originalQuestions, shuffledQuestions: run.queue, currentIndex: 0, score: run.score, wrongQuestions: [], timeLeft: 900, timerActive: false, ...(!legacy ? { run } : {}) };
}
const SAVED_MCQ = { id: 'offline-mcq', type: 'mcq', text: 'Which planet is closest to the Sun?', options: ['Mercury', 'Venus'], correct: 0, expectedAnswer: 'Mercury', hint: 'Mercury is first.', whyExplanation: 'It has the innermost orbit.', language: 'en' };
const SAVED_SHORT = { id: 'offline-short', type: 'short_answer', text: 'Name the nearest star to Earth.', expectedAnswer: 'Sun', language: 'en' };

// Each route gets an isolated DOM so one broken extracted view does not prevent
// the remaining routes from running and reporting their own runtime error.
test('mounted frontend: guest first render uses subpath APIs without runtime diagnostics', async t => {
  const app = await mountApp(t);
  assert.match(app.document.querySelector('h1')?.textContent || '', /Welcome to the challenge/);
  assert.equal(app.document.documentElement.lang, 'en');
  assert.equal(app.document.documentElement.dir, 'ltr');
  for (const endpoint of ['/api/config', '/api/version', '/api/billing/packs', '/api/material-quota']) {
    assert.ok(app.requests.some(request => request.path === `/teachnator${endpoint}`), `Startup must load ${endpoint} under the deployment subpath`);
  }
  assertNamed(app.button('Audio and focus settings'), 'Settings trigger');
  assertNamed(app.button('Voice assistant'), 'Narrator toggle');
  app.assertHealthy('guest first render complete');
});

test('mounted frontend: matching forced release stays quiet and stale banners clear', async t => {
  let current = { ...VERSION, build: 'different-build', forceReload: false };
  const app = await mountApp(t, { versionResponse: () => current });
  const banner = () => [...app.document.querySelectorAll('button')].find(button => /Later|لاحقاً/.test(readableName(button)));
  assert.ok(banner(), 'A genuinely different build should display an update');
  current = { ...VERSION, forceReload: true };
  app.window.Date.now = () => Date.now() + 10000;
  await app.act(() => app.window.dispatchEvent(new app.window.Event('focus')));
  await app.waitFor(() => !banner(), 'current release clears the old banner');
  app.assertHealthy('same build must not reload even with forceReload enabled');
});

test('mounted frontend: setup typing preserves DOM identity and focus with an accessible label', async t => {
  const app = await mountApp(t);
  const input = app.document.querySelector('form input[type="text"]');
  for (const value of ['R', 'Ru', 'Runtime learner']) {
    await app.fill(input, value, `setup typing ${value}`);
    assertSameNode(app.document.querySelector('form input[type="text"]'), input, 'Setup rerender must not replace the name input');
    assert.ok(app.document.querySelector('header').textContent.includes(value), 'Typing must update React state, not only the DOM value');
  }
  assertNamed(input, 'Setup name input');
});

test('mounted frontend: settings dialog, language rerender, range input and Escape remain healthy', async t => {
  const app = await mountApp(t);
  const trigger = app.button('Audio and focus settings');
  await app.click(trigger, 'open settings');
  const dialog = await app.waitFor(() => app.document.querySelector('[data-study-dialog="settings"]'), 'settings dialog');
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assertNamed(dialog, 'Settings dialog');
  assert.ok(dialog.contains(app.document.activeElement), 'Opening settings must move focus inside');
  await app.click(app.button('Switch interface language', dialog), 'settings language -> Arabic');
  assert.equal(app.document.documentElement.lang, 'ar');
  assert.equal(app.document.documentElement.dir, 'rtl');
  assertSameNode(app.document.querySelector('[data-study-dialog="settings"]'), dialog, 'Language change must not remount settings');
  await app.click(app.button('تبديل لغة الواجهة', dialog), 'settings language -> English');
  // Pink noise starts disabled as a real user preference; toggling it mounts its
  // labelled range control and exercises an extracted SettingsView handler.
  const noiseToggle = [...dialog.querySelectorAll('button')].find(button => /Disabled|معطلة/i.test(readableName(button)));
  assert.ok(noiseToggle, 'Pink noise toggle must render');
  await app.click(noiseToggle, 'enable pink noise');
  const range = dialog.querySelector('input[type="range"]');
  assertNamed(range, 'Pink noise volume');
  await app.fill(range, '0.12', 'adjust pink noise volume');
  assertSameNode(dialog.querySelector('input[type="range"]'), range, 'Range rerender must retain DOM identity');
  assert.match(dialog.textContent, /12%/);
  await app.escape('close settings with Escape');
  assert.equal(app.document.querySelector('[data-study-dialog="settings"]'), null);
  assertSameNode(app.document.activeElement, trigger, 'Escape must restore focus to the settings trigger');
});

test('mounted frontend: upload text stays focused and guest generation stays blocked', async t => {
  const app = await mountApp(t);
  await enterUpload(app);
  const fileInput = app.document.querySelector('input[type="file"]');
  assert.equal(fileInput.disabled, true, 'Guest file generation must stay disabled');
  await app.click(app.button('Paste text'), 'switch to text upload');
  const textarea = app.document.querySelector('textarea');
  for (const value of ['Offline', 'Offline lesson text']) {
    await app.fill(textarea, value, 'upload text entry');
    assertSameNode(app.document.querySelector('textarea'), textarea, 'Upload text rerender must retain DOM identity');
  }
  assert.equal(app.button('Analyze text with AI').disabled, true, 'Guest generation button must remain disabled');
  assertNamed(textarea, 'Lesson text input');
  for (const page of ['privacy', 'terms', 'contact']) {
    assert.ok(app.document.querySelector(`a[href="/teachnator/${page}"]`), `${page} link must respect the deployment base`);
  }
  assert.ok(!app.requests.some(request => /material-generations|\/ai\/generate/.test(request.path)), 'Typing must not start a generation request');
});

test('mounted frontend: demo study reveals MCQ, hints, fill-blank and short-answer cards', async t => {
  const app = await mountApp(t);
  await enterDemo(app);
  await app.click(app.button('Learning phase (memory secrets)'), 'demo intro -> study');
  assert.match(app.document.querySelector('h2')?.textContent || '', /الكوكب الأقرب/);
  const reveal = app.button('Reveal answer');
  assertNamed(reveal, 'Study reveal control');
  await app.click(reveal, 'reveal MCQ answer');
  assert.match(app.document.body.textContent, /عطارد/);
  await app.click(app.button(/Click to discover the magical memory secret/), 'reveal study mnemonic');
  assert.match(app.document.body.textContent, /Memory key:/);
  await app.click(app.button('Next question'), 'study next -> fill blank');
  assert.match(app.document.querySelector('h2')?.textContent || '', /\[_____\]/);
  await app.click(app.button('Reveal answer'), 'reveal fill-blank answer');
  assert.match(app.document.body.textContent, /البناء الضوئي/);
  await app.click(app.button('Next question'), 'study next -> short answer');
  await app.click(app.button('Reveal answer'), 'reveal short-answer model');
  assert.match(app.document.body.textContent, /ميلان محور دورانها/);
  app.assertHealthy('demo study complete');
});

test('mounted frontend: demo quiz and explanation dialog render without extracted-prop errors', async t => {
  const app = await mountApp(t);
  await enterDemo(app);
  await app.click(app.button('Start quiz now'), 'demo intro -> quiz');
  assertNamed(app.button('Restart study cards from the beginning without losing your material'), 'Quiz study navigation');
  const memoryTrigger = app.button('Explanation & memory secret');
  await app.click(memoryTrigger, 'open quiz explanation');
  const memory = await app.waitFor(() => app.document.querySelector('[data-study-dialog="quiz-memory"]'), 'quiz explanation');
  assertNamed(memory, 'Quiz explanation dialog');
  assert.equal(memory.getAttribute('aria-modal'), 'true');
  assert.ok(memory.contains(app.document.activeElement), 'Explanation must receive focus');
  await app.escape('close quiz explanation');
  assert.equal(app.document.querySelector('[data-study-dialog="quiz-memory"]'), null);
  assertSameNode(app.document.activeElement, memoryTrigger, 'Explanation must restore trigger focus');
  const answer = app.document.querySelector('textarea');
  if (answer) {
    await app.fill(answer, 'Offline answer', 'quiz short-answer typing');
    assertNamed(answer, 'Quiz short-answer input');
  } else {
    // MCQ choices carry material metadata; fill-blank chips intentionally do
    // not. Verify the actual rendered, accessible material choices for either
    // shuffled type instead of requiring an MCQ-only DOM implementation detail.
    const demoOption = /^(?:\([A-Dأبجد]\)\s*)?(?:الزهرة|عطارد|المريخ|الأرض|البناء الضوئي|التنفس الخلوي|التبخر السطحي|الانقسام الخيطي|الكلوروفيل|الكاروتين|الهيموجلوبين|الميلانين|[5-8] قارات|التجمد|التبخر|التكثف|الانصهار)$/;
    const options = [...app.document.querySelectorAll('button')].filter(button => demoOption.test(readableName(button)));
    assert.equal(options.length, 4, 'Quiz must render all four real demo material options');
    options.forEach(option => { assertNamed(option, 'Quiz material option'); assert.equal(option.disabled, false); });
  }
  await app.click(app.button('Restart study cards from the beginning without losing your material'), 'quiz -> study');
  assertNamed(app.button('Reveal answer'), 'Restored study reveal control');
});

test('mounted frontend: restored guest study mounts and reveals its answer independently of upload', async t => {
  const app = await mountApp(t, { savedGuest: savedGuestRun('learn', SAVED_MCQ) });
  assert.match(app.document.querySelector('h2')?.textContent || '', /Which planet is closest/);
  await app.click(app.button('Reveal answer'), 'reveal saved guest MCQ');
  assert.match(app.document.body.textContent, /Mercury/);
  app.assertHealthy('restored guest study');
});

test('mounted frontend: restored guest short-answer quiz types and grades locally without a provider', async t => {
  const app = await mountApp(t, { savedGuest: savedGuestRun('quiz', SAVED_SHORT) });
  const answer = await app.waitFor(() => app.document.querySelector('textarea'), 'restored short-answer quiz');
  assertNamed(answer, 'Restored short-answer input');
  await app.fill(answer, 'Sun', 'saved short-answer typing');
  await app.click(app.button('Review answer'), 'local short-answer grading');
  await app.waitFor(() => /Lexical match|تطابق لفظي/.test(app.document.body.textContent), 'local grading feedback');
  assert.ok(!app.requests.some(request => request.path.includes('/ai/generate')), 'Saved guest grading must remain local');
  app.assertHealthy('restored guest grading');
});

test('mounted frontend: legacy guest quiz migrates to a canonical run without losing its question', async t => {
  const app = await mountApp(t, { savedGuest: savedGuestRun('quiz', SAVED_SHORT, { legacy: true }) });
  assert.match(app.document.querySelector('h2')?.textContent || '', /Name the nearest star to Earth/);
  assertNamed(app.document.querySelector('textarea'), 'Migrated short-answer input');
  const archive = JSON.parse(app.window.localStorage.getItem('smartExamGuestMaterial.v1'));
  assert.ok(archive.run?.runId, 'Legacy workspace must be persisted with a canonical run');
  assert.equal(archive.run.mode, 'quiz');
  assert.equal(archive.run.queue[0].id, SAVED_SHORT.id);
  app.assertHealthy('legacy guest quiz migration');
});

test('mounted frontend: restored guest result mounts without extracted-prop errors', async t => {
  const app = await mountApp(t, { savedGuest: savedGuestRun('result', SAVED_MCQ) });
  assert.match(app.document.body.textContent, /100%/);
  app.assertHealthy('restored guest result');
});

test('mounted frontend: authenticated account lists saved materials and closes accessibly', async t => {
  const app = await mountApp(t, { user: STUDENT });
  const trigger = await app.waitFor(() => [...app.document.querySelectorAll('header button')].find(button => readableName(button) === 'Account'), 'authenticated account trigger');
  await app.click(trigger, 'open account');
  const dialog = await app.waitFor(() => app.document.querySelector('[data-study-dialog="account"]'), 'account dialog');
  assertNamed(dialog, 'Account dialog');
  assert.match(dialog.textContent, /Runtime Student/);
  await app.waitFor(() => dialog.textContent.includes(MATERIAL.title), 'saved material list');
  assert.ok(app.requests.some(request => request.path === '/teachnator/api/auth/me'));
  assert.ok(app.requests.some(request => request.path === '/teachnator/api/materials'));
  await app.escape('close account');
  assert.equal(app.document.querySelector('[data-study-dialog="account"]'), null);
  assertSameNode(app.document.activeElement, trigger, 'Account close must restore trigger focus');
});

test('mounted frontend: admin users, AI settings and version tabs mount without invoking writes', async t => {
  const app = await mountApp(t, { user: ADMIN });
  const trigger = await app.waitFor(() => [...app.document.querySelectorAll('header button')].find(button => readableName(button) === 'Admin panel'), 'admin trigger');
  await app.click(trigger, 'open admin');
  const dialog = await app.waitFor(() => app.document.querySelector('[data-study-dialog="admin"]'), 'admin dialog');
  assertNamed(dialog, 'Admin dialog');
  await app.waitFor(() => dialog.textContent.includes(STUDENT.email), 'admin user list');
  const quotaInput = dialog.querySelector('input[type="number"]');
  assertNamed(quotaInput, 'Admin user quota input');
  await app.fill(quotaInput, '7', 'edit admin user quota without saving');
  assertSameNode(dialog.querySelector('input[type="number"]'), quotaInput, 'Admin quota rerender must retain input identity');
  await app.click(app.button(/AI settings (?:and|&) keys|إعدادات الذكاء الاصطناعي والمفاتيح/i, dialog), 'admin AI settings tab');
  const model = await app.waitFor(() => [...dialog.querySelectorAll('input')].find(input => input.value === 'offline-model'), 'admin model setting');
  await app.fill(model, 'offline-model-edited', 'edit admin model without saving');
  await app.click(app.button(/App version (?:and|&) auto-update|إصدار التطبيق والتحديث التلقائي/i, dialog), 'admin version tab');
  assert.ok([...dialog.querySelectorAll('input')].some(input => input.value === VERSION.version), 'Version tab must show the server version');
  await app.escape('close admin');
  assert.equal(app.document.querySelector('[data-study-dialog="admin"]'), null);
  assertSameNode(app.document.activeElement, trigger, 'Admin close must restore trigger focus');
  assert.ok(!app.requests.some(request => request.method !== 'GET' && !request.path.endsWith('/client-errors')), 'Admin inspection/editing must not submit saves or provider tests');
});
