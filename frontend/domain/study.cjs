'use strict';
const { normalizeQuestions, prepareQuizQuestions, clampStudyIndex, queueReviewQuestion, addWrongQuestion } = require('./questions.cjs');
const { createTimer, updateTimer } = require('./timer.cjs');
function newRunId() { return globalThis.crypto?.randomUUID?.() || `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`; }
function createRun({ owner, materialKey, mode, questions, originalQuestions = questions, runId = newRunId(), now = Date.now(), random = Math.random }) {
  const bank = normalizeQuestions(questions);
  const queue = mode === 'quiz' ? prepareQuizQuestions(bank, random) : bank;
  return { owner, materialKey: String(materialKey), runId, mode, queue, originalQuestions: normalizeQuestions(originalQuestions), wrongQuestions: [], currentIndex: 0, score: 0, consecutiveStreak: 0, completed: false,
    timer: createTimer({ owner, materialKey, mode, runId, running: true, now }) };
}
function answerTransition(run, isCorrect) {
  const question = run.queue[run.currentIndex];
  if (!question || run.completed) return run;
  const queue = isCorrect ? run.queue : queueReviewQuestion(run.queue, run.currentIndex);
  const currentIndex = run.currentIndex + 1;
  return { ...run, queue, currentIndex, score: run.score + (isCorrect ? 1 : 0), wrongQuestions: isCorrect ? run.wrongQuestions : addWrongQuestion(run.wrongQuestions, question), consecutiveStreak: isCorrect ? run.consecutiveStreak + 1 : 0, completed: currentIndex >= queue.length, timer: updateTimer(run.timer, { running: currentIndex < queue.length && run.timer.running }) };
}
function learnTransition(run, mastered) {
  if (!run.queue[run.currentIndex] || run.completed) return run;
  const queue = mastered ? run.queue.map((q, index) => index === run.currentIndex ? { ...q, masteryLevel: 3 } : q) : queueReviewQuestion(run.queue, run.currentIndex);
  const currentIndex = run.currentIndex + 1;
  return { ...run, queue, currentIndex, completed: currentIndex >= queue.length, timer: updateTimer(run.timer, { running: currentIndex < queue.length && run.timer.running }) };
}
function checkpoint(run, now = Date.now()) {
  const timer = updateTimer(run.timer, { now, running: !run.completed && run.timer.running });
  return { materialId: Number(run.materialKey), mode: run.mode, currentIndex: run.currentIndex, score: run.score, totalQuestions: run.queue.length, isCompleted: run.completed ? 1 : 0,
    state: { runId: run.runId, owner: run.owner, materialKey: run.materialKey, mode: run.mode, shuffledQuestions: run.queue, wrongQuestions: run.wrongQuestions,
      currentIndex: run.currentIndex, score: run.score, consecutiveStreak: run.consecutiveStreak, timer, timeLeft: Math.ceil(timer.remainingMs / 1000), timerActive: timer.running } };
}
function restoreRun({ owner, materialKey, mode, questions, progress, now = Date.now(), keepCompleted = false }) {
  const saved = progress?.state || {};
  const queue = normalizeQuestions(saved.shuffledQuestions);
  if (!progress || (Number(progress.is_completed) && !keepCompleted) || !queue.length || (saved.owner && saved.owner !== owner) || (saved.mode && saved.mode !== mode) || (saved.materialKey != null && String(saved.materialKey) !== String(materialKey))) return createRun({ owner, materialKey, mode, questions, now });
  const runId = saved.runId || newRunId();
  const scope = { owner, materialKey: String(materialKey), mode, runId };
  const timer = saved.timer && saved.timer.owner === owner && String(saved.timer.materialKey) === String(materialKey) && saved.timer.mode === mode && saved.timer.runId === runId
    ? saved.timer : createTimer({ ...scope, remainingMs: Math.max(0, Number(saved.timeLeft ?? 900)) * 1000, running: saved.timerActive === true, now });
  const currentIndex = Number(progress.is_completed) && keepCompleted ? queue.length : clampStudyIndex(saved.currentIndex ?? progress.current_index, queue.length);
  return { ...scope, queue, originalQuestions: normalizeQuestions(questions), currentIndex, score: Math.min(currentIndex, Math.max(0, Number(saved.score ?? progress.score) || 0)), wrongQuestions: normalizeQuestions(saved.wrongQuestions), consecutiveStreak: Math.max(0, Number(saved.consecutiveStreak) || 0), completed: keepCompleted && !!Number(progress.is_completed), timer: keepCompleted && Number(progress.is_completed) ? updateTimer(timer, { now, running: false }) : timer };
}
module.exports = { newRunId, createRun, answerTransition, learnTransition, checkpoint, restoreRun };
