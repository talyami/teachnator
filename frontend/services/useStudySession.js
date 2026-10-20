import { useEffect, useRef, useState } from 'react';
import { createRun, checkpoint, restoreRun } from '../domain/study.cjs';
import { remainingMs, updateTimer, reconcileTimer, timerKey } from '../domain/timer.cjs';
import { createProgressWriter } from './progress.cjs';
import { materialApi } from './api.js';
import { reportClientError } from './diagnostics.cjs';

// One authoritative immutable run feeds UI, local snapshots, timer, and queued writes.
export function useStudySession({ owner, token, identityRef, onApply, onConflict, onError, paused }) {
  const runRef = useRef(null);
  const [seconds, setSeconds] = useState(900);
  const [running, setRunning] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const selectionVersion = useRef(0);
  const latest = useRef({ owner, token, onApply, onConflict, onError, paused });
  latest.current = { owner, token, onApply, onConflict, onError, paused };
  const writerRef = useRef(null);
  const storage = () => latest.current.token ? sessionStorage : localStorage;
  const scopeFor = run => ({ owner: run.owner, materialId: Number(run.materialKey), mode: run.mode, runId: run.runId, token: latest.current.token });
  if (!writerRef.current) writerRef.current = createProgressWriter({
    get: scope => materialApi(`/api/progress/${encodeURIComponent(scope.materialId)}?mode=${scope.mode}`, { token: scope.token }),
    post: (scope, body) => materialApi('/api/progress', { token: scope.token, method: 'POST', body }),
    isCurrent: scope => scope.owner === latest.current.owner && scope.token === identityRef.current,
    onConflict: scope => { if (scope.owner !== latest.current.owner || runRef.current?.runId !== scope.runId) return; setBlocked(true); reportClientError('progress_conflict'); latest.current.onConflict(); },
    onError: (_, scope) => { if (runRef.current?.runId !== scope.runId) return; setBlocked(true); reportClientError('progress_save_failed'); latest.current.onError(); }
  });
  function display(run) { setSeconds(Math.ceil(remainingMs(run.timer) / 1000)); setRunning(run.timer.running); }
  function saveTimer(run) {
    try { storage().setItem(timerKey(run.timer), JSON.stringify(run.timer)); }
    catch (_) { reportClientError('local_save_failed'); }
  }
  function save(run) {
    if (run.owner !== latest.current.owner || identityRef.current !== latest.current.token) return Promise.resolve();
    saveTimer(run);
    if (latest.current.token && /^\d+$/.test(run.materialKey) && identityRef.current === latest.current.token && run.owner === latest.current.owner) {
      return writerRef.current.enqueue(scopeFor(run), checkpoint(run));
    }
    return Promise.resolve();
  }
  function apply(run, persist = true) {
    if (run.owner !== latest.current.owner) return null;
    if (latest.current.paused && run.timer.running) run = { ...run, timer: updateTimer(run.timer, { running: false }), modalResume: true };
    const old = runRef.current;
    if (old && old.runId !== run.runId && old.owner === latest.current.owner) save({ ...old, timer: updateTimer(old.timer, { running: false }), modalResume: false });
    runRef.current = run;
    display(run);
    latest.current.onApply(run);
    if (persist) save(run);
    return run;
  }
  function commit(run) { return apply(run, true); }
  function hold(run) {
    if (run.owner !== latest.current.owner) return;
    if (latest.current.paused && run.timer.running) run = { ...run, timer: updateTimer(run.timer, { running: false }), modalResume: true };
    runRef.current = run; display(run); save(run);
  }
  function fresh(mode, questions, originalQuestions, materialKey) {
    selectionVersion.current += 1;
    return commit(createRun({ owner: latest.current.owner, materialKey, mode, questions, originalQuestions }));
  }
  async function resume(mode, questions, materialKey, { keepCompleted = false } = {}) {
    const version = ++selectionVersion.current;
    const captured = { owner: latest.current.owner, token: latest.current.token };
    const data = await writerRef.current.load({ ...captured, materialId: Number(materialKey), mode });
    if (!data || version !== selectionVersion.current || captured.owner !== latest.current.owner || captured.token !== identityRef.current) return null;
    let run = restoreRun({ owner: captured.owner, materialKey, mode, questions, progress: data.progress, keepCompleted });
    try { run = { ...run, timer: reconcileTimer(run.timer, JSON.parse(storage().getItem(timerKey(run.timer)) || 'null')) }; } catch (_) {}
    setBlocked(false);
    return apply(run);
  }
  function hydrate(run) {
    let restored = run;
    try { restored = { ...run, timer: reconcileTimer(run.timer, JSON.parse(storage().getItem(timerKey(run.timer)) || 'null')) }; } catch (_) {}
    return apply(restored, false);
  }
  function changeTimer({ running: desired, extendMs = 0 } = {}) {
    const run = runRef.current;
    if (!run || blocked) return;
    const timer = updateTimer(run.timer, { running: desired ?? run.timer.running, extendMs });
    runRef.current = { ...run, timer, modalResume: false };
    display(runRef.current);
    save(runRef.current);
  }
  function clear() {
    selectionVersion.current += 1;
    const run = runRef.current;
    if (run && run.owner === latest.current.owner) save({ ...run, timer: updateTimer(run.timer, { running: false }), modalResume: false });
    runRef.current = null; setSeconds(900); setRunning(false); setBlocked(false);
  }
  // Modal pause is elapsed-time based; a delayed interval cannot slow the countdown.
  useEffect(() => {
    const run = runRef.current;
    if (!run) return;
    const desired = run.timer.running;
    if (paused && desired) {
      const pausedRun = { ...run, timer: updateTimer(run.timer, { running: false }), modalResume: true };
      runRef.current = pausedRun; display(pausedRun); save(pausedRun);
    } else if (!paused && run.modalResume) {
      const resumed = { ...run, timer: updateTimer(run.timer, { running: true }), modalResume: false };
      runRef.current = resumed; display(resumed); save(resumed);
    }
  }, [paused]);
  useEffect(() => {
    let lastCheckpoint = 0;
    const tick = () => {
      const run = runRef.current;
      if (!run || run.owner !== latest.current.owner) return;
      const value = Math.ceil(remainingMs(run.timer) / 1000);
      setSeconds(value); setRunning(run.timer.running);
      if (Date.now() - lastCheckpoint >= 10000) {
        lastCheckpoint = Date.now();
        const settled = { ...run, timer: updateTimer(run.timer) };
        runRef.current = settled; saveTimer(settled);
      }
    };
    const id = setInterval(tick, 250);
    const exit = () => { const run = runRef.current; if (run) save(run); };
    window.addEventListener('pagehide', exit);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); window.removeEventListener('pagehide', exit); document.removeEventListener('visibilitychange', tick); };
  }, []);
  useEffect(() => () => writerRef.current.dispose(), []);
  return { runRef, seconds, running, blocked, commit, hold, fresh, resume, hydrate, changeTimer, clear, invalidateSelection: () => { selectionVersion.current += 1; }, flush: () => writerRef.current.flush(), save };
}
