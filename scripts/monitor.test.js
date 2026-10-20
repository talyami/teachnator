'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkBackup, checkDisk, readMonitorState, writeMonitorState, collectChecks, main } = require('./monitor');
const NOW = Date.parse('2026-10-20T12:00:00.000Z');
const recent = 'fast-learning-2026-10-20T03-15-00-000Z.sql.gz';
const entry = (name, file = true) => ({ name, isFile: () => file });
function fakeFiles(names = [recent]) {
  return { readdir: async () => names.map(name => typeof name === 'string' ? entry(name) : name), lstat: async () => ({ isFile: () => true, size: 100 }), statfs: async () => ({ blocks: 1000n, bavail: 500n }) };
}
test('backup age uses valid completed filenames not mtime, partials, symlinks or empty files', async () => {
  const files = fakeFiles([recent, 'fast-learning-2020-01-01T00-00-00-000Z.sql.gz', 'fast-learning-2026-11-01T00-00-00-000Z.sql.gz', 'fast-learning-2026-02-30T00-00-00-000Z.sql.gz', `${recent}.partial`, entry('fast-learning-2026-10-20T11-59-00-000Z.sql.gz', false), 'other.sql.gz']);
  const result = await checkBackup('/private', { fsImpl: files, now: NOW, maxAgeMs: 36 * 3600000 });
  assert.equal(result.healthy, true); assert.equal(result.ageMs, 8.75 * 3600000);
  assert.equal((await checkBackup('/private', { fsImpl: files, now: NOW, maxAgeMs: 3600000 })).healthy, false);
  assert.equal((await checkBackup('/private', { fsImpl: fakeFiles([]), now: NOW, maxAgeMs: 3600000 })).healthy, false);
  files.lstat = async () => ({ isFile: () => true, size: 0 });
  assert.equal((await checkBackup('/private', { fsImpl: files, now: NOW, maxAgeMs: 36 * 3600000 })).healthy, false);
});
test('readiness and latency fail closed, optional disk uses available space', async () => {
  const files = fakeFiles(); let options;
  let result = await collectChecks({ env: { HEALTHCHECK_URL: 'http://127.0.0.1/api/ready', MONITOR_DISK_PATH: '/private' }, now: () => NOW, fsImpl: files, probeImpl: async (_url, opts) => { options = opts; return { healthy: true, durationMs: 2100 }; } });
  assert.deepEqual(result.checks, { readiness: true, latency: false, backup: true, disk: true }); assert.equal(options.quiet, true);
  files.statfs = async () => ({ blocks: 1000n, bavail: 50n });
  assert.equal((await checkDisk('/private', { fsImpl: files })).healthy, false);
  files.statfs = async () => ({ blocks: 0n, bavail: 0n });
  await assert.rejects(checkDisk('/private', { fsImpl: files }), /DISK_CHECK_FAILED/);
  result = await collectChecks({ env: {}, now: () => NOW, fsImpl: { readdir: async () => { throw new Error('secret backup path'); } }, probeImpl: async () => { throw new Error('secret readiness URL'); } });
  assert.deepEqual(result.checks, { readiness: false, latency: false, backup: false });
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});
test('monitor state is validated and private, atomic, bounded and POSIX-only', async () => {
  const state = { version: 1, current: 'healthy', failedChecks: [], lastDelivered: null };
  let closed = 0, written, renamed, removed;
  const fsImpl = {
    open: async () => ({ stat: async () => ({ isFile: () => true, size: 100, mode: 0o100600, uid: 1000 }), readFile: async () => JSON.stringify({ ...state, secret: 'must disappear' }), close: async () => { closed++; } }),
    mkdir: async (_path, opts) => assert.equal(opts.mode, 0o700),
    lstat: async () => ({ isDirectory: () => true, mode: 0o40700, uid: 1000 }),
    writeFile: async (_path, text, opts) => { written = JSON.parse(text); assert.deepEqual(opts, { mode: 0o600, flag: 'wx' }); },
    rename: async (from, to) => { renamed = { from, to }; }, rm: async name => { removed = name; }
  };
  assert.deepEqual(await readMonitorState('/private/state.json', { fsImpl, platform: 'linux', uid: 1000 }), state); assert.equal(closed, 1);
  await writeMonitorState('/private/state.json', { ...state, secret: 'omit' }, { fsImpl, platform: 'linux', uid: 1000, random: () => 'id' });
  assert.deepEqual(written, state); assert.equal(renamed.to, '/private/state.json'); assert.match(removed, /monitor-id/);
  await assert.rejects(readMonitorState('/private/state.json', { fsImpl, platform: 'win32' }), /POSIX/);
  fsImpl.open = async () => ({ stat: async () => ({ isFile: () => true, size: 100, mode: 0o100644, uid: 1000 }), close: async () => { closed++; } });
  await assert.rejects(readMonitorState('/private/state.json', { fsImpl, platform: 'linux', uid: 1000 }), /NOT_PRIVATE/);
  fsImpl.open = async () => ({ stat: async () => ({ isFile: () => true, size: 20000, mode: 0o100600, uid: 1000 }), close: async () => {} });
  await assert.rejects(readMonitorState('/private/state.json', { fsImpl, platform: 'linux', uid: 1000 }), /NOT_PRIVATE/);
  fsImpl.open = async () => { const error = new Error('private path'); error.code = 'ENOENT'; throw error; };
  assert.equal(await readMonitorState('/private/state.json', { fsImpl, platform: 'linux' }), null);
  fsImpl.lstat = async () => ({ isDirectory: () => false, mode: 0o40700, uid: 1000 });
  await assert.rejects(writeMonitorState('/private/state.json', state, { fsImpl, platform: 'linux', uid: 1000 }), /DIRECTORY_NOT_PRIVATE/);
  await assert.rejects(readMonitorState('/private/state.json', { fsImpl, platform: 'linux', uid: 1000 }), /DIRECTORY_NOT_PRIVATE/);
});
test('invalid and failed monitor state never forwards raw state contents or paths', async () => {
  const fsImpl = { mkdir: async () => {}, lstat: async () => ({ isDirectory: () => true, mode: 0o40700, uid: 1000 }), open: async () => ({ stat: async () => ({ isFile: () => true, size: 20, mode: 0o100600, uid: 1000 }), readFile: async () => 'secret-token-not-json', close: async () => {} }) };
  await assert.rejects(readMonitorState('/secret-path/state.json', { fsImpl, platform: 'linux', uid: 1000 }), error => error.message === 'MONITOR_STATE_READ_FAILED' && !String(error.stack).includes('secret-token'));
  fsImpl.writeFile = async () => { throw new Error('private disk path'); };
  let removed = false; fsImpl.rm = async () => { removed = true; };
  await assert.rejects(writeMonitorState('/private/state.json', { version: 1, current: 'healthy', failedChecks: [], lastDelivered: null }, { fsImpl, platform: 'linux', uid: 1000 }));
  assert.equal(removed, true);
});
test('one-shot monitor persists transitions, cooldown and retries recovery delivery without leaking URLs', async () => {
  let state = null, healthy = false, failDelivery = false; const events = [], logs = [];
  const options = { env: { HEALTHCHECK_URL: 'https://secret.example/readiness?token=private', BACKUP_DIR: '/private/backups', APP_BUILD_HASH: 'r123' }, fsImpl: fakeFiles(), now: () => NOW,
    probeImpl: async () => { if (!healthy) throw new Error('private provider error'); return { healthy: true, durationMs: 50 }; },
    loadState: async () => state, saveState: async (_name, value) => { state = value; }, logger: line => logs.push(line),
    notify: async event => { if (failDelivery) throw new Error('private URL'); events.push(event); return { delivered: true }; }
  };
  let result = await main(options); assert.equal(result.exitCode, 1); assert.equal(events.length, 1);
  result = await main(options); assert.equal(result.transition, null); assert.equal(events.length, 1);
  healthy = true; failDelivery = true;
  result = await main(options); assert.equal(result.transition, 'recovery'); assert.equal(result.exitCode, 1); assert.equal(state.lastDelivered.state, 'failure');
  failDelivery = false; result = await main(options);
  assert.equal(result.exitCode, 0); assert.equal(events.length, 2); assert.equal(state.lastDelivered.state, 'recovery');
  assert.doesNotMatch(JSON.stringify({ state, logs, events }), /secret.example|private|token|provider error|https?:/);
});
