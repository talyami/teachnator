'use strict';
const fail = message => Object.assign(new Error(message), { status: 400 });
const MODES = new Set(['quiz', 'learn', 'intro', 'speed']);
function positiveId(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw fail('A valid materialId is required.');
  return Number(value);
}
function modeValue(value = 'quiz') {
  if (typeof value !== 'string' || !MODES.has(value)) throw fail('Invalid study mode.');
  return value;
}
function validateProgress(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('Invalid progress body.');
  if (!Number.isSafeInteger(body.saveRevision) || body.saveRevision < 0) throw fail('A nonnegative safe-integer saveRevision is required.');
  const result = { materialId: positiveId(body.materialId), mode: modeValue(body.mode), saveRevision: body.saveRevision };
  for (const key of ['currentIndex', 'score', 'totalQuestions', 'correctCount', 'wrongCount']) {
    const value = body[key] ?? 0;
    const maximum = key === 'score' ? 100000000 : 10000;
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw fail(`Invalid ${key}.`);
    result[key] = value;
  }
  if (result.currentIndex > result.totalQuestions || result.correctCount + result.wrongCount > result.totalQuestions) throw fail('Progress counters exceed question count.');
  if (body.isCompleted !== undefined && ![true, false, 0, 1].includes(body.isCompleted)) throw fail('Invalid completion flag.');
  result.isCompleted = body.isCompleted ? 1 : 0;
  let state = body.state ?? {};
  if (typeof state === 'string') {
    try { state = JSON.parse(state); } catch { throw fail('Invalid progress state JSON.'); }
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw fail('Progress state must be an object.');
  // Bound depth/node count as well as bytes to avoid pathological nested snapshots.
  let nodes = 0;
  function visit(value, depth) {
    if (++nodes > 100000 || depth > 16) throw fail('Progress state is too complex.');
    if (typeof value === 'number' && !Number.isFinite(value)) throw fail('Progress state contains a non-finite number.');
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw fail('Invalid progress state key.');
        visit(child, depth + 1);
      }
    }
  }
  visit(state, 0);
  if (state.timeLeft !== undefined && (typeof state.timeLeft !== 'number' || !Number.isFinite(state.timeLeft) || state.timeLeft < 0 || state.timeLeft > 86400)) throw fail('Invalid state timeLeft.');
  if (state.timerActive !== undefined && typeof state.timerActive !== 'boolean') throw fail('Invalid state timerActive.');
  if (state.currentIndex !== undefined && state.currentIndex !== result.currentIndex) throw fail('State index mismatch.');
  if (state.score !== undefined && state.score !== result.score) throw fail('State score mismatch.');
  if (state.shuffledQuestions !== undefined && (!Array.isArray(state.shuffledQuestions) || state.shuffledQuestions.length > 10000 ||
      state.shuffledQuestions.some(q => !q || typeof q !== 'object' || Array.isArray(q)))) throw fail('Invalid state question bank.');
  result.stateJson = JSON.stringify(state);
  if (Buffer.byteLength(result.stateJson, 'utf8') > 1900000) throw fail('Progress state is too large.');
  return result;
}
module.exports = { positiveId, modeValue, validateProgress };
