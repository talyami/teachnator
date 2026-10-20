'use strict';
// Private one-shot CLI. Imports do not load .env, connect to MySQL or schedule work.
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { probe } = require('./healthcheck');
const { BACKUP_FILENAME } = require('./backup');
const { getMonitorConfig, createWebhookNotifier, validateMonitorState, evaluateMonitor } = require('../monitoring');

function monitorError(code) { const error = new Error(code); error.code = code; return error; }
async function checkBackup(directory, { fsImpl = fs, now = Date.now(), maxAgeMs } = {}) {
  let latest = null;
  const entries = await fsImpl.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const match = entry.isFile() && BACKUP_FILENAME.exec(entry.name);
    if (!match) continue;
    const iso = `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
    const stamp = Date.parse(iso);
    if (!Number.isFinite(stamp) || new Date(stamp).toISOString() !== iso || stamp > now) continue;
    const stat = await fsImpl.lstat(path.join(directory, entry.name));
    if (!stat.isFile() || stat.size <= 0) continue;
    if (latest === null || stamp > latest) latest = stamp;
  }
  const ageMs = latest === null ? null : Math.max(0, now - latest);
  return { healthy: ageMs !== null && ageMs <= maxAgeMs, ageMs };
}
async function checkDisk(directory, { fsImpl = fs, minFreePercent = 10 } = {}) {
  const stat = await fsImpl.statfs(directory, { bigint: true });
  const total = BigInt(stat.blocks), free = BigInt(stat.bavail);
  if (total <= 0n || free < 0n || free > total) throw monitorError('MONITOR_DISK_CHECK_FAILED');
  const freePercent = Number((free * 10000n) / total) / 100;
  return { healthy: freePercent >= minFreePercent, freePercent };
}
function assertPrivatePlatform(platform) {
  // POSIX private state permissions must not silently become ineffective Windows modes.
  if (platform === 'win32') throw monitorError('MONITOR_REQUIRES_POSIX_STATE');
}
async function prepareStateDirectory(filename, fsImpl, uid) {
  const directory = path.dirname(filename);
  await fsImpl.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fsImpl.lstat(directory);
  // Require a dedicated private directory. Never chmod an arbitrary shared parent.
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || (uid !== undefined && stat.uid !== uid)) throw monitorError('MONITOR_STATE_DIRECTORY_NOT_PRIVATE');
  return directory;
}
async function readMonitorState(filename, { fsImpl = fs, platform = process.platform, uid = process.getuid?.() } = {}) {
  assertPrivatePlatform(platform);
  await prepareStateDirectory(filename, fsImpl, uid);
  let handle;
  try {
    handle = await fsImpl.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 16384 || (stat.mode & 0o077) !== 0 || (uid !== undefined && stat.uid !== uid)) throw monitorError('MONITOR_STATE_NOT_PRIVATE');
    const state = validateMonitorState(JSON.parse(await handle.readFile('utf8')));
    if (!state) throw monitorError('MONITOR_STATE_INVALID');
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw monitorError(error.code === 'MONITOR_STATE_NOT_PRIVATE' ? error.code : 'MONITOR_STATE_READ_FAILED');
  } finally { await handle?.close(); }
}
async function writeMonitorState(filename, state, { fsImpl = fs, platform = process.platform, uid = process.getuid?.(), random = randomUUID } = {}) {
  assertPrivatePlatform(platform);
  const clean = validateMonitorState(state);
  if (!clean) throw monitorError('MONITOR_STATE_INVALID');
  const directory = await prepareStateDirectory(filename, fsImpl, uid);
  const temporary = path.join(directory, `.monitor-${random()}.tmp`);
  try {
    await fsImpl.writeFile(temporary, JSON.stringify(clean) + '\n', { mode: 0o600, flag: 'wx' });
    await fsImpl.rename(temporary, filename);
  } finally { await fsImpl.rm(temporary, { force: true }); }
}
async function collectChecks({ env = process.env, fsImpl = fs, probeImpl = probe, now = Date.now, fetchImpl = global.fetch } = {}) {
  const config = getMonitorConfig(env);
  const checks = { readiness: false, latency: false, backup: false };
  const metrics = {};
  try {
    const result = await probeImpl(env.HEALTHCHECK_URL || 'http://127.0.0.1:3025/api/ready', { fetchImpl, now, quiet: true });
    checks.readiness = result?.healthy === true;
    const duration = result?.durationMs;
    checks.latency = Number.isFinite(duration) && duration >= 0 && duration <= config.maxLatencyMs;
    if (Number.isFinite(duration) && duration >= 0) metrics.latencyMs = Math.round(duration);
  } catch { /* No configured URL or raw network errors are logged. */ }
  try {
    const backup = await checkBackup(path.resolve(env.BACKUP_DIR || path.join(__dirname, '..', 'backups')), { fsImpl, now: now(), maxAgeMs: config.maxBackupAgeMs });
    checks.backup = backup.healthy;
    metrics.backupAgeHours = backup.ageMs === null ? null : Math.round(backup.ageMs / 360000) / 10;
  } catch { checks.backup = false; }
  if (config.diskPath) {
    try {
      const disk = await checkDisk(config.diskPath, { fsImpl, minFreePercent: config.diskMinFreePercent });
      checks.disk = disk.healthy; metrics.diskFreePercent = disk.freePercent;
    } catch { checks.disk = false; }
  }
  return { checks, metrics };
}
async function main({ env = process.env, fsImpl = fs, probeImpl = probe, fetchImpl = global.fetch, now = Date.now, notify, logger = console, platform = process.platform, uid = process.getuid?.(), loadState = readMonitorState, saveState = writeMonitorState } = {}) {
  const config = getMonitorConfig(env);
  const statePath = path.resolve(env.MONITOR_STATE_PATH || '/var/lib/fast-learning-monitor/state.json');
  const previous = await loadState(statePath, { fsImpl, platform, uid });
  const { checks, metrics } = await collectChecks({ env, fsImpl, probeImpl, fetchImpl, now });
  const result = await evaluateMonitor({ checks, previous, now: now(), cooldownMs: config.cooldownMs, notify: notify || createWebhookNotifier({ env, fetchImpl }), release: env.APP_BUILD_HASH || env.APP_VERSION });
  await saveState(statePath, result.state, { fsImpl, platform, uid });
  const summary = { code: result.healthy ? 'MONITOR_HEALTHY' : 'MONITOR_UNHEALTHY', checks, metrics, transition: result.transition, delivery: result.delivery };
  if (typeof logger === 'function') logger(JSON.stringify(summary)); else logger.info(JSON.stringify(summary));
  return { ...result, checks, metrics, exitCode: !result.healthy || result.delivery.reason === 'delivery_failed' ? 1 : 0 };
}
if (require.main === module) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  main().then(result => { process.exitCode = result.exitCode; }).catch(() => { console.error('MONITOR_FAILED'); process.exitCode = 1; });
}
module.exports = { checkBackup, checkDisk, readMonitorState, writeMonitorState, collectChecks, main };
