'use strict';
const DEFAULT_DURATION_MS = 15 * 60 * 1000;
function createTimer({ owner = 'guest', materialKey = '', mode = 'learn', runId, remainingMs = DEFAULT_DURATION_MS, running = false, now = Date.now() }) {
  return { owner, materialKey: String(materialKey), mode, runId, remainingMs: Math.max(0, remainingMs), running, anchoredAt: now, updatedAt: now };
}
function remainingMs(timer, now = Date.now()) {
  if (!timer) return DEFAULT_DURATION_MS;
  return Math.max(0, timer.remainingMs - (timer.running ? Math.max(0, now - timer.anchoredAt) : 0));
}
function updateTimer(timer, { now = Date.now(), running = timer.running, extendMs = 0 } = {}) {
  const remaining = Math.max(0, remainingMs(timer, now) + extendMs);
  return { ...timer, remainingMs: remaining, running: running && remaining > 0, anchoredAt: now, updatedAt: now };
}
function sameTimerScope(a, b) { return !!a && !!b && ['owner','materialKey','mode','runId'].every(key => String(a[key]) === String(b[key])); }
function reconcileTimer(server, local) {
  if (!sameTimerScope(server, local)) return server;
  return Number(local.updatedAt) > Number(server.updatedAt) ? local : server;
}
function timerKey(timer) { return `smartExamTimer.v2:${encodeURIComponent(timer.owner)}:${encodeURIComponent(timer.materialKey)}:${timer.mode}:${encodeURIComponent(timer.runId)}`; }
module.exports = { DEFAULT_DURATION_MS, createTimer, remainingMs, updateTimer, sameTimerScope, reconcileTimer, timerKey };
