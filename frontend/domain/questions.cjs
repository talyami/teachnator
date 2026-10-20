'use strict';
function getContentLanguage(content) {
  if (content && typeof content === 'object' && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(content.language || '')) return content.language.toLowerCase();
  const text = typeof content === 'string' ? content : content?.text || content?.clozeText || content?.expectedAnswer || '';
  return (text.match(/[\u0620-\u064A\u066E-\u06D3]/g) || []).length > (text.match(/[a-z]/gi) || []).length ? 'ar' : 'en';
}
function normalizeArabicText(text) {
  return String(text || '').normalize('NFKC').toLowerCase().replace(/[\u064B-\u065F\u0670]/g, '').replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
function clozePosition(text, word, metadata = {}) {
  const positions = [];
  if (!word) return null;
  for (let index = text.indexOf(word); index >= 0; index = text.indexOf(word, index + word.length)) positions.push(index);
  if (metadata.missingWordStart != null) {
    if (!Number.isInteger(metadata.missingWordStart) || !positions.includes(metadata.missingWordStart)) return null;
    if (metadata.clozeOccurrence != null && positions[metadata.clozeOccurrence - 1] !== metadata.missingWordStart) return null;
    return metadata.missingWordStart;
  }
  // Occurrences are one-based, matching author-facing text and the server schema.
  if (metadata.clozeOccurrence != null) return Number.isInteger(metadata.clozeOccurrence) && metadata.clozeOccurrence > 0 ? positions[metadata.clozeOccurrence - 1] ?? null : null;
  if (metadata.clozeText?.includes('[_____]')) {
    const index = metadata.clozeText.indexOf('[_____]');
    if (metadata.clozeText.replace('[_____]', word) === text && positions.includes(index)) return index;
  }
  return positions.length === 1 ? positions[0] : null;
}
function normalizeQuestion(input, index = 0) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (input.type != null && !['mcq', 'short_answer', 'fill_blank'].includes(input.type)) return null;
  const strings = ['text','expectedAnswer','missingWord','clozeText','hint','visualSketch','visualAnchor','whyExplanation','explanation','coreConcept','language'];
  if (strings.some(key => input[key] != null && typeof input[key] !== 'string')) return null;
  if (input.options != null && (!Array.isArray(input.options) || input.options.some(option => typeof option !== 'string' || !option.trim()))) return null;
  const q = { ...input, text: (input.text || input.clozeText || '').trim(), options: (input.options || []).map(option => option.trim()) };
  if (!q.text) return null;
  const type = q.type || (q.missingWord && q.clozeText ? 'fill_blank' : q.options.length > 1 ? 'mcq' : 'short_answer');
  const rawCorrect = typeof q.correct === 'string' && /^\d+$/.test(q.correct) ? Number(q.correct) : q.correct;
  const matched = q.options.findIndex(option => type === 'fill_blank' ? normalizeArabicText(option) === normalizeArabicText(q.missingWord || q.expectedAnswer) : option === q.expectedAnswer);
  const correct = Number.isInteger(rawCorrect) && rawCorrect >= 0 && rawCorrect < q.options.length ? rawCorrect : matched >= 0 ? matched : null;
  const expectedAnswer = (q.expectedAnswer || q.missingWord || (correct !== null ? q.options[correct] : '')).trim();
  if (!expectedAnswer) return null;
  if (type !== 'short_answer' && (q.options.length < 2 || correct === null || new Set(q.options).size !== q.options.length)) return null;
  const missingWord = type === 'fill_blank' ? (q.missingWord || expectedAnswer).trim() : '';
  let clozeText = q.clozeText || '';
  let missingWordStart = null;
  if (type === 'fill_blank') {
    missingWordStart = clozePosition(q.text, missingWord, q);
    // A legacy already-blanked question is unambiguous; a repeated full-text answer is not.
    if (missingWordStart !== null) clozeText = q.text.slice(0, missingWordStart) + '[_____]' + q.text.slice(missingWordStart + missingWord.length);
    else if (q.missingWordStart != null || q.clozeOccurrence != null || !q.text.includes('[_____]') || !clozeText.includes('[_____]')) return null;
    if (!q.options.some(option => normalizeArabicText(option) === normalizeArabicText(missingWord))) return null;
  }
  const identity = JSON.stringify([type, q.text, expectedAnswer, missingWord]);
  let hash = 2166136261;
  for (const char of identity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return { id: typeof q.id === 'string' && q.id ? q.id : `q_${(hash >>> 0).toString(36)}`, type, text: q.text,
    options: q.options, correct: type === 'short_answer' ? null : correct, expectedAnswer, missingWord, clozeText,
    ...(missingWordStart !== null ? { missingWordStart } : {}), ...(q.clozeOccurrence != null ? { clozeOccurrence: q.clozeOccurrence } : {}),
    hint: q.hint || '', visualSketch: q.visualSketch || q.visualAnchor || '', whyExplanation: q.whyExplanation || q.explanation || '',
    coreConcept: q.coreConcept || '', language: getContentLanguage(q), masteryLevel: Math.min(3, Math.max(0, Number(q.masteryLevel) || 0)),
    soundAnchorId: Number(q.soundAnchorId) || index % 5, isReviewQueue: q.isReviewQueue === true, reviewQueueCount: Math.max(0, Number(q.reviewQueueCount) || 0) };
}
function normalizeQuestions(items) {
  const used = new Set();
  const canonical = new Map();
  return (Array.isArray(items) ? items : []).map(normalizeQuestion).filter(Boolean).map(q => {
    if (q.isReviewQueue && canonical.has(q.id)) return { ...q, id: canonical.get(q.id) };
    const original = q.id;
    let suffix = 2;
    while (used.has(q.id)) q = { ...q, id: `${original}__${suffix++}` };
    used.add(q.id);
    if (!canonical.has(original)) canonical.set(original, q.id);
    return q;
  });
}
const clampStudyIndex = (index, length) => Math.max(0, Math.min(Math.max(0, length - 1), Number.isFinite(Number(index)) ? Math.floor(Number(index)) : 0));
function queueReviewQuestion(questions, index) {
  const next = [...questions];
  if (next[index]) next.splice(Math.min(next.length, index + 4), 0, { ...next[index], isReviewQueue: true, reviewQueueCount: (next[index].reviewQueueCount || 0) + 1 });
  return next;
}
const addWrongQuestion = (questions, question) => questions.some(item => item.id === question.id) ? questions : [...questions, question];
function shuffledCopy(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
function prepareQuizQuestions(questions, random = Math.random) {
  return shuffledCopy(normalizeQuestions(questions), random).map(q => {
    if (q.type === 'short_answer') return q;
    const choices = shuffledCopy(q.options.map((text, index) => ({ text, index })), random);
    return { ...q, options: choices.map(choice => choice.text), correct: choices.findIndex(choice => choice.index === q.correct) };
  });
}
function localEvaluateShortAnswer(expectedAnswer, studentAnswer, language = getContentLanguage(expectedAnswer)) {
  // Negation is never a stop word. Contractions and Arabic particles must not disappear.
  const normalize = text => normalizeArabicText(String(text).replace(/[’']/g, ''));
  const expected = normalize(expectedAnswer), student = normalize(studentAnswer);
  const expectedTokens = [...new Set(expected.split(' ').filter(Boolean))];
  const studentTokens = [...new Set(student.split(' ').filter(Boolean))];
  const negatives = new Set(['not','no','never','neither','nor','without','cannot','cant','isnt','arent','wasnt','werent','dont','doesnt','didnt','wont','wouldnt','shouldnt','couldnt','لا','ما','لم','لن','ليس','ليست','ليسا','ليسوا','غير','دون','بدون']);
  const hasNegation = [...expectedTokens, ...studentTokens].some(token => negatives.has(token) || /^(?:غير|بدون)/.test(token));
  const match = studentTokens.filter(token => expectedTokens.includes(token)).length;
  const similarityScore = Math.round(100 * Math.min(match / Math.max(expectedTokens.length, 1), match / Math.max(studentTokens.length, 1)));
  // Reordered negated clauses can invert meaning even with identical token sets.
  const isCorrect = Boolean(expected && student && (expected === student || (!hasNegation && similarityScore === 100)));
  return { isCorrect, similarityScore: isCorrect ? 100 : Math.min(99, similarityScore), evaluationMethod: 'lexical', uiFeedback: true, language,
    feedback: !student ? 'لم يتم كتابة إجابة.' : isCorrect ? 'تقدير لفظي محلي: الكلمات الأساسية متطابقة؛ المعنى لم يُتحقق منه.' : 'تقدير لفظي محلي: الكلمات غير متطابقة بالكامل؛ قارن المعنى بالإجابة النموذجية.', revisedAnswer: expectedAnswer };
}
function getSpokenQuestionText(q) {
  return typeof q === 'string' ? q : q?.type === 'fill_blank' ? q.clozeText.replace(/\[_____\]/g, getContentLanguage(q) === 'ar' ? ' فراغ ' : ' ... ') : q?.text || '';
}
module.exports = { getContentLanguage, normalizeArabicText, clozePosition, normalizeQuestion, normalizeQuestions, clampStudyIndex, queueReviewQuestion, addWrongQuestion, shuffledCopy, prepareQuizQuestions, localEvaluateShortAnswer, getSpokenQuestionText };
