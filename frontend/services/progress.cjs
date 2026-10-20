'use strict';
function createProgressWriter({ get, post, isCurrent = () => true, onConflict = () => {}, onError = () => {} }) {
  const streams = new Map();
  const activeRuns = new Map();
  let active = true;
  const keyFor = scope => `${scope.owner}|${scope.materialId}|${scope.mode}`;
  function stream(scope) {
    const key = keyFor(scope);
    if (!streams.has(key)) streams.set(key, { tail: Promise.resolve(), revision: null, blocked: false, runId: null });
    return streams.get(key);
  }
  async function load(scope) {
    const state = stream(scope);
    const selection = { materialId: scope.materialId, mode: scope.mode, runId: null };
    state.runId = null;
    activeRuns.set(scope.owner, selection);
    await state.tail;
    if (!active || !isCurrent(scope) || activeRuns.get(scope.owner) !== selection) return null;
    const data = await get(scope);
    if (!active || !isCurrent(scope) || activeRuns.get(scope.owner) !== selection) return null;
    if (!Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error('Invalid progress revision');
    state.revision = data.revision;
    state.blocked = false;
    return data;
  }
  function runCurrent(scope) {
    const current = activeRuns.get(scope.owner);
    // Modes have separate server rows/serialized streams. A learn completion may
    // finish after quiz starts, but must never cross materials or supersede a run
    // in its own mode (state.runId is checked before every queued operation).
    return !!current && current.materialId === scope.materialId;
  }
  function enqueue(scope, snapshot) {
    const state = stream(scope);
    state.runId = scope.runId;
    activeRuns.set(scope.owner, { materialId: scope.materialId, mode: scope.mode, runId: scope.runId });
    // Clone at enqueue time: delayed network work must not read changed React closures.
    const body = JSON.parse(JSON.stringify(snapshot));
    const task = state.tail.then(async () => {
      if (!active || !isCurrent(scope) || state.runId !== scope.runId || !runCurrent(scope)) return { skipped: true };
      if (state.blocked) { onConflict(scope); return { conflict: true }; }
      try {
        if (state.revision === null) {
          const data = await get(scope);
          if (!active || !isCurrent(scope) || state.runId !== scope.runId || !runCurrent(scope)) return { skipped: true };
          if (!Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error('Invalid progress revision');
          // Never replace an unknown existing checkpoint. Explicit resume loads it first.
          if (data.revision !== 0) { state.blocked = true; onConflict(scope); return { conflict: true }; }
          state.revision = 0;
        }
        const data = await post(scope, { ...body, expectedRevision: state.revision });
        if (!Number.isSafeInteger(data.revision) || data.revision <= state.revision) throw new Error('Invalid progress revision');
        state.revision = data.revision;
        return data;
      } catch (error) {
        if (error.status === 409) { state.blocked = true; if (active && isCurrent(scope) && runCurrent(scope) && state.runId === scope.runId) onConflict(scope); return { conflict: true }; }
        // The response may have been lost after commit. Stop rather than retry with stale state.
        state.blocked = true;
        if (active && isCurrent(scope) && runCurrent(scope) && state.runId === scope.runId) onError(error, scope);
        return { error: true };
      }
    });
    state.tail = task.catch(() => {});
    return task;
  }
  return { load, enqueue, flush: () => Promise.all([...streams.values()].map(state => state.tail)), dispose: () => { active = false; }, isBlocked: scope => stream(scope).blocked };
}
module.exports = { createProgressWriter };
