import React from 'react';
import { getContentLanguage, normalizeArabicText, prepareQuizQuestions } from '../domain/questions.cjs';
const isFillBlankQuestion = q => q?.type === 'fill_blank';
const isShortAnswerQuestion = q => q?.type === 'short_answer';
const { version: APP_CLIENT_VERSION, build: APP_CLIENT_BUILD } = require('../../release.cjs');
import { uiText } from '../i18n/index.js';
import { initAudio, playClick, playMemoryAnchor, playFlipTone, playSparkleTone, updatePinkNoiseLive } from '../services/audio.js';

export default function ResultView(props) {
  const { beginRun, t, speak, renderSpeakerButton, getFinishSpeechText, handleRequestNewMaterial, setMode, playerName, questionsData, setQuestionsData, setCurrentIndex, setShowHint, score, setScore, shuffledQuestions, setShuffledQuestions, setSelectedAnswer, setIsAnswerChecked, setStudentShortAnswer, setIsEvaluatingShortAnswer, setShortAnswerEvaluation, timeLeft, setTimeLeft, setTimerActive, soundEnabled, allOriginalQuestions, wrongQuestions, setWrongQuestions } = props;
  return (<div className="text-center space-y-6 my-auto">
                  <div className="w-24 h-24 bg-gradient-to-tr from-yellow-400 to-amber-500 text-white rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-amber-100 floating-card">
                    <i className="fa-solid fa-trophy text-4xl"></i>
                  </div>
                  
                  <div>
                    <h1 data-study-heading tabIndex={-1} className="text-3xl font-black text-slate-800 flex items-center justify-center gap-2">
                      <span>{score === (shuffledQuestions.length || questionsData.length) ? t('علامة كاملة يا بطل! 🌟') : score >= ((shuffledQuestions.length || questionsData.length) * 0.7) ? t('رائع جداً يا {name}! 👏', {name: playerName}) : t('أداء جيد وقابل للتطور! 💪')}</span>
                      {renderSpeakerButton(getFinishSpeechText(playerName, score, shuffledQuestions.length || questionsData.length, Math.round((score / Math.max(shuffledQuestions.length || questionsData.length, 1)) * 100)), 'scale-90')}
                    </h1>
                    <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 my-3">
                      {score} / {shuffledQuestions.length || questionsData.length}
                    </div>
                    <p className="text-slate-500 text-sm">
                      {t('نسبتك: {percent}%', {percent: Math.round((score / Math.max(shuffledQuestions.length || questionsData.length, 1)) * 100)})}
                    </p>
                  </div>

                  {/* مؤشر التثبيت في الذاكرة الدائمة (Memory Strength Gauge) */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 max-w-sm mx-auto text-right space-y-2 shadow-xs">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <i className="fa-solid fa-brain text-purple-600"></i> {t('ملخص أداء هذه الجولة:')}
                      </span>
                      <span className="text-emerald-700 font-black">{Math.round((score / Math.max(shuffledQuestions.length || questionsData.length, 1)) * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 h-full rounded-full transition-all duration-1000"
                        style={{ width: `${Math.round((score / Math.max(shuffledQuestions.length || questionsData.length, 1)) * 100)}%` }}
                      ></div>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {score === (shuffledQuestions.length || questionsData.length)
                        ? t('أحسنت في هذه الجولة؛ راجع المفاهيم لاحقاً للتحقق من التذكر.')
                        : t('💡 راجع الأسئلة الخاطئة وتحقق من فهمك؛ لا تقيس نتيجة الجولة الحفظ طويل المدى.')}
                    </p>
                  </div>

                  <div className="space-y-2.5 max-w-sm mx-auto pt-2">
                    {/* مراجعة وإعادة دراسة الأخطاء فقط إذا وُجدت */}
                    {wrongQuestions.length > 0 && (
                      <div className="space-y-2 p-3 bg-amber-50 rounded-2xl border border-amber-200 text-right">
                        <p className="text-xs font-black text-amber-800 flex items-center gap-1.5">
                          <i className="fa-solid fa-triangle-exclamation"></i>
                          {t('لديك {count} سؤال بحاجة لتثبيت الذاكرة:', {count: wrongQuestions.length})}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button"
                            onClick={() => beginRun('learn', wrongQuestions)} className="bg-amber-500 hover:bg-amber-600 text-white py-2.5 px-3 rounded-xl font-bold text-xs transition shadow-sm cursor-pointer"
                          >
                            <i className="fa-solid fa-book-open ml-1"></i> {t('مراجعة أخطائي فقط')}
                          </button>
                          <button type="button"
                            onClick={() => beginRun('quiz', wrongQuestions)} className="bg-rose-500 hover:bg-rose-600 text-white py-2.5 px-3 rounded-xl font-bold text-xs transition shadow-sm cursor-pointer"
                          >
                            <i className="fa-solid fa-bolt ml-1"></i> {t('اختبار الأخطاء فقط')}
                          </button>
                        </div>
                      </div>
                    )}

                    <button type="button"
                      onClick={() => beginRun('learn', allOriginalQuestions.length ? allOriginalQuestions : questionsData)} className="w-full flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-3.5 rounded-2xl font-bold transition text-sm cursor-pointer"
                    >
                      <i className="fa-solid fa-key text-amber-500"></i> {t('إعادة دراسة كل شيء ({count} أسئلة)', {count: allOriginalQuestions.length || questionsData.length})}
                    </button>

                    <div className="flex gap-2">
                      <button type="button"
                        onClick={() => beginRun('quiz', allOriginalQuestions.length ? allOriginalQuestions : questionsData)} className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 rounded-2xl font-bold transition shadow-md shadow-emerald-100 text-sm cursor-pointer"
                      >
                        <i className="fa-solid fa-rotate-right"></i> {t('إعادة الاختبار بالكامل')}
                      </button>
                      <button type="button"
                        onClick={handleRequestNewMaterial} 
                        className="px-5 bg-slate-800 hover:bg-slate-900 text-white py-3.5 rounded-2xl font-bold transition cursor-pointer" 
                        aria-label={t('رفع درس جديد')} title={t('رفع درس جديد')}
                      >
                        <i className="fa-solid fa-cloud-arrow-up"></i>
                      </button>
                    </div>
                  </div>
                </div>);
}
