import React from 'react';
import { getContentLanguage, normalizeArabicText, prepareQuizQuestions } from '../domain/questions.cjs';
const getOptionLetter = (index, question) => (getContentLanguage(question).startsWith('ar') ? ['أ','ب','ج','د','هـ','و'] : ['A','B','C','D','E','F'])[index] || String(index + 1);
const isFillBlankQuestion = q => q?.type === 'fill_blank';
const isShortAnswerQuestion = q => q?.type === 'short_answer';
const { version: APP_CLIENT_VERSION, build: APP_CLIENT_BUILD } = require('../../release.cjs');
import { uiText, translateUi } from '../i18n/index.js';
import { initAudio, playClick, playMemoryAnchor, playFlipTone, playSparkleTone, updatePinkNoiseLive } from '../services/audio.js';

export default function QuizView(props) {
  const { t, speak, renderSpeakerButton, openQuizMemory, handleStartOverQuiz, startLearning, handleAnswerClick, handleFillBlankClick, handleShortAnswerSubmit, handleNextQuestion, toggleVoiceInput, uiLanguage, currentIndex, score, shuffledQuestions, selectedAnswer, isAnswerChecked, studentShortAnswer, setStudentShortAnswer, isEvaluatingShortAnswer, shortAnswerEvaluation, isListeningSpeech, consecutiveStreak, fillBlankSelected } = props;
  return (<div className="flex flex-col h-full">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3 shrink-0">
                    <button type="button" onClick={startLearning}
                      aria-label={t('ابدأ بطاقات المذاكرة من البداية مع الاحتفاظ بالمادة')} title={t('ابدأ بطاقات المذاكرة من البداية مع الاحتفاظ بالمادة')}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition">
                      <i aria-hidden="true" className="fa-solid fa-book-open"></i>{t('العودة للمذاكرة')}
                    </button>
                    <button type="button" onClick={openQuizMemory} aria-haspopup="dialog" aria-controls="quiz-memory-dialog"
                      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 transition">
                      <i aria-hidden="true" className="fa-solid fa-wand-magic-sparkles"></i>{t('شرح ومفتاح الحفظ')}
                    </button>
                  </div>
                  <div className="flex justify-between items-center mb-4 shrink-0 text-sm font-bold flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{t('سؤال {current} من {total}', {current: currentIndex + 1, total: shuffledQuestions.length})}</span>
                      <button type="button"
                        onClick={handleStartOverQuiz}
                        className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition"
                        aria-label={t('إعادة بدء الاختبار من السؤال الأول')} title={t('إعادة بدء الاختبار من السؤال الأول')}
                      >
                        <i className="fa-solid fa-rotate-left text-[10px]"></i> {t('البدء من جديد')}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {consecutiveStreak >= 2 && (
                        <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-full text-xs font-black flex items-center gap-1 animate-bounce shadow-sm">
                          <i className="fa-solid fa-fire text-amber-500"></i>
                          <span>{t('سلسلة إتقان x{count}', {count: consecutiveStreak})}</span>
                        </span>
                      )}
                      {shuffledQuestions[currentIndex].isReviewQueue && (
                        <span className="bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-full text-xs font-black flex items-center gap-1">
                          <i className="fa-solid fa-bullseye text-[10px]"></i> {t('فرصة تثبيت')}
                        </span>
                      )}
                      {isFillBlankQuestion(shuffledQuestions[currentIndex]) && (
                        <span className="bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                          <i className="fa-solid fa-wand-magic text-[10px]"></i> {t('إكمال الفراغ')}
                        </span>
                      )}
                      {isShortAnswerQuestion(shuffledQuestions[currentIndex]) && (
                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                          <i className="fa-solid fa-pen-nib text-[10px]"></i> {t('إجابة قصيرة')}
                        </span>
                      )}
                      <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">{t('النقاط: {score}', {score})}</span>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl text-right mb-4 shrink-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        {isShortAnswerQuestion(shuffledQuestions[currentIndex]) && (
                          <div className="text-[11px] font-black text-indigo-600 mb-1 flex items-center gap-1">
                            <i className="fa-solid fa-wand-magic-sparkles"></i> {t('سؤال مقالي قصير (تدقيق بالذكاء الاصطناعي مع تسامح التعبير والطباعة)')}
                          </div>
                        )}
                        <h2 data-study-heading tabIndex={-1} dir="auto" className="text-lg sm:text-xl font-bold text-slate-800 leading-relaxed">
                          {isFillBlankQuestion(shuffledQuestions[currentIndex])
                            ? t('أكمل الفراغ بالكلمة المفتاحية الصحيحة:')
                            : shuffledQuestions[currentIndex].text}
                        </h2>
                      </div>
                      {renderSpeakerButton(shuffledQuestions[currentIndex])}
                    </div>
                  </div>

                  {isFillBlankQuestion(shuffledQuestions[currentIndex]) ? (
                    /* واجهة سؤال إكمال الفراغ والتوليد النشط (Cloze Deletion / Generation Effect) */
                    <div className="flex-1 flex flex-col justify-between overflow-y-auto gap-4">
                      <div className="bg-white border-2 border-indigo-100 p-5 rounded-2xl shadow-sm text-center">
                        <span className="text-xs font-bold text-teal-700 block mb-2">
                          <i className="fa-solid fa-wand-magic-sparkles ml-1"></i> {t('اختر الكلمة الصحيحة لملء الفراغ وترسيخ المفهوم:')}
                        </span>
                        <p dir="auto" className="text-lg sm:text-xl font-black text-slate-800 leading-loose">
                          {(shuffledQuestions[currentIndex].clozeText || shuffledQuestions[currentIndex].text).split('[_____]').map((part, pIdx, arr) => (
                            <React.Fragment key={pIdx}>
                              <span>{part}</span>
                              {pIdx < arr.length - 1 && (
                                <span className={`inline-flex items-center justify-center px-4 py-1 mx-1.5 rounded-xl border-2 text-base font-black transition-all ${
                                  !isAnswerChecked 
                                    ? 'border-indigo-400 border-dashed bg-indigo-50/80 text-indigo-700 min-w-[110px] animate-pulse'
                                    : normalizeArabicText(fillBlankSelected) === normalizeArabicText(shuffledQuestions[currentIndex].missingWord || shuffledQuestions[currentIndex].expectedAnswer)
                                      ? 'border-emerald-500 bg-emerald-100 text-emerald-900 shadow-sm'
                                      : 'border-red-400 bg-red-100 text-red-900'
                                }`}>
                                  {fillBlankSelected || '... ؟ ...'}
                                </span>
                              )}
                            </React.Fragment>
                          ))}
                        </p>
                      </div>

                      {/* رقائق وبطاقات الكلمات للاختيار السريع والتوليد النشط */}
                      <div className="space-y-2">
                        <span className="block text-xs font-bold text-slate-500 text-right">{t('انقر على الكلمة المناسبة:')}</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {shuffledQuestions[currentIndex].options.map((opt, i) => {
                            const isCorrectWord = normalizeArabicText(opt) === normalizeArabicText(shuffledQuestions[currentIndex].missingWord || shuffledQuestions[currentIndex].expectedAnswer);
                            let chipStyle = "p-3.5 rounded-2xl border-2 font-black text-base transition-all select-none text-center cursor-pointer shadow-sm ";
                            if (!isAnswerChecked) {
                              chipStyle += "bg-white border-slate-200 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50 active:scale-95";
                            } else {
                              if (isCorrectWord) {
                                chipStyle += "bg-emerald-50 border-emerald-500 text-emerald-800 scale-[1.02] shadow-md shadow-emerald-100";
                              } else if (opt === fillBlankSelected) {
                                chipStyle += "bg-red-50 border-red-500 text-red-700";
                              } else {
                                chipStyle += "bg-white border-slate-200 opacity-40 text-slate-400";
                              }
                            }
                            return (
                              <button type="button"
                                key={`fill-opt-${i}`}
                                disabled={isAnswerChecked}
                                onClick={() => handleFillBlankClick(opt)}
                                dir="auto" className={chipStyle}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : !isShortAnswerQuestion(shuffledQuestions[currentIndex]) ? (
                    /* واجهة أسئلة الاختيار من متعدد MCQ وصح/خطأ Y/N مع حماية كاملة للمس على الآيباد */
                    <div className="space-y-2.5 flex-1 overflow-y-auto">
                      {shuffledQuestions[currentIndex].options.map((opt, i) => {
                        const isYn = shuffledQuestions[currentIndex].options.length === 2;
                        let btnStyle = "quiz-option-btn w-full flex items-center gap-2 p-3.5 rounded-2xl border-2 font-bold text-base transition-colors select-none ";
                        if (!isAnswerChecked) {
                          btnStyle += "bg-white border-slate-200 text-slate-700 quiz-option-btn-idle active:bg-indigo-50 active:border-indigo-400 active:scale-[0.99]";
                        } else {
                          if (i === shuffledQuestions[currentIndex].correct) {
                            btnStyle += "bg-emerald-50 border-emerald-500 text-emerald-800 scale-[1.01] shadow-md shadow-emerald-100";
                          } else if (i === selectedAnswer) {
                            btnStyle += "bg-red-50 border-red-500 text-red-700";
                          } else {
                            btnStyle += "bg-white border-slate-200 opacity-40 text-slate-400";
                          }
                        }

                        const optClean = String(opt || '').trim();
                        const isTrueOpt = isYn && /^(صح|نعم|true|yes)$/i.test(optClean);
                        const isFalseOpt = isYn && /^(خطأ|لا|false|no)$/i.test(optClean);

                        return (
                          <div key={`q-${currentIndex}-opt-${i}`} className="flex items-center gap-2">
                          <button type="button"
                            onClick={() => handleAnswerClick(i)}
                            disabled={isAnswerChecked}
                            dir={getContentLanguage(shuffledQuestions[currentIndex]).startsWith('ar') ? 'rtl' : 'ltr'} data-material-text lang={getContentLanguage(shuffledQuestions[currentIndex])}
                            className={btnStyle}
                          >
                            <bdi className="w-8 shrink-0 font-black text-slate-400">({getOptionLetter(i, shuffledQuestions[currentIndex])})</bdi>
                            {isTrueOpt && <i aria-hidden="true" className="fa-solid fa-check text-emerald-600 shrink-0"></i>}
                            {isFalseOpt && <i aria-hidden="true" className="fa-solid fa-xmark text-red-500 shrink-0"></i>}
                            <bdi className="flex-1 min-w-0 break-words">{opt}</bdi>

                            {isAnswerChecked && i === shuffledQuestions[currentIndex].correct && (
                              <i className="fa-solid fa-circle-check text-emerald-500 shrink-0 text-lg"></i>
                            )}
                            {isAnswerChecked && i === selectedAnswer && i !== shuffledQuestions[currentIndex].correct && (
                              <i className="fa-solid fa-circle-xmark text-red-500 shrink-0 text-lg"></i>
                            )}
                          </button>
                          <button type="button" onClick={() => speak(opt, true, getContentLanguage(shuffledQuestions[currentIndex]))}
                            aria-label={`${t('استمع للخيار')}: ${opt}`} title={t('استمع للخيار')}
                            className="text-slate-500 hover:text-indigo-600 p-3 rounded-xl hover:bg-indigo-50 shrink-0">
                            <i aria-hidden="true" className="fa-solid fa-volume-low"></i>
                          </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* واجهة سؤال الإجابة القصيرة مع التدقيق والمراجعة بالذكاء الاصطناعي */
                    <div className="flex-1 flex flex-col justify-between overflow-y-auto gap-4">
                      {!isAnswerChecked ? (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1.5 text-right">
                              {t('اكتب إجابتك هنا بأسلوبك وكلماتك الخاصة:')}
                            </label>
                            <div className="relative">
                              <textarea
                                aria-label={t('اكتب إجابتك هنا بأسلوبك وكلماتك الخاصة:')} rows="3"
                                value={studentShortAnswer}
                                onChange={(e) => setStudentShortAnswer(e.target.value)}
                                dir="auto" placeholder={t('اكتب إجابتك هنا... (يراعي المصحح الذكي تفاوت التعبير، المرادفات، والأخطاء الإملائية) ✍️')}
                                disabled={isEvaluatingShortAnswer}
                                className="w-full p-4 pl-20 border-2 border-slate-200 rounded-2xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none text-base text-slate-800 font-semibold resize-none transition bg-white shadow-inner"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (!isEvaluatingShortAnswer && studentShortAnswer.trim()) {
                                      handleShortAnswerSubmit();
                                    }
                                  }
                                }}
                              />
                              <div className="absolute left-3 top-3 flex items-center gap-1.5">
                                <button type="button"
                                  onClick={toggleVoiceInput}
                                  className={`p-2 rounded-xl text-xs transition cursor-pointer ${
                                    isListeningSpeech ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                  }`}
                                  aria-label={isListeningSpeech ? t('إيقاف الاستماع') : t('إملاء صوتي')} title={isListeningSpeech ? t('إيقاف الاستماع') : t('إملاء صوتي')}
                                >
                                  <i className={`fa-solid ${isListeningSpeech ? 'fa-microphone-lines' : 'fa-microphone'}`}></i>
                                </button>
                                {studentShortAnswer && !isEvaluatingShortAnswer && (
                                  <button type="button"
                                    onClick={() => setStudentShortAnswer('')}
                                    className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer"
                                    aria-label={t('مسح النص')} title={t('مسح النص')}
                                  >
                                    <i className="fa-solid fa-xmark text-xs"></i>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs text-slate-400 font-bold px-1">
                            <span className="flex items-center gap-1 text-slate-500">
                              <i className="fa-solid fa-brain text-indigo-500"></i> {uiLanguage === 'ar' ? 'تقييم AI عند توفره، وإلا تقدير لفظي محلي فقط' : 'AI assessment when available; otherwise a local lexical estimate only'}
                            </span>
                            <span>{t('{count} حرف', {count: studentShortAnswer.length})}</span>
                          </div>

                          <button type="button"
                            onClick={handleShortAnswerSubmit}
                            disabled={isEvaluatingShortAnswer || !studentShortAnswer.trim()}
                            className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 text-white font-black py-3.5 px-6 rounded-2xl transition shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 cursor-pointer text-base"
                          >
                            {isEvaluatingShortAnswer ? (
                              <>
                                <i className="fa-solid fa-spinner fa-spin"></i>
                                <span>{t('جاري مراجعة وتحليل الإجابة بالذكاء الاصطناعي...')}</span>
                              </>
                            ) : (
                              <>
                                <i className="fa-solid fa-wand-magic-sparkles"></i>
                                <span>{uiLanguage === 'ar' ? 'مراجعة الإجابة' : 'Review answer'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        /* بطاقة نتيجة المراجعة الذكية للذكاء الاصطناعي */
                        <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                          <div className={`p-4 rounded-2xl border-2 text-right ${
                            shortAnswerEvaluation?.isCorrect 
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-emerald-100' 
                              : 'bg-rose-50 border-rose-300 text-rose-950 shadow-rose-100'
                          } shadow-sm`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 font-black text-base">
                                {shortAnswerEvaluation?.isCorrect ? (
                                  <>
                                    <i className="fa-solid fa-circle-check text-emerald-500 text-xl"></i>
                                    <span>{shortAnswerEvaluation?.evaluationMethod === 'lexical' ? (uiLanguage === 'ar' ? 'تطابق لفظي — راجع المعنى' : 'Lexical match — check the meaning') : (uiLanguage === 'ar' ? 'مقبولة وفق تقدير AI' : 'Accepted by AI estimate')}</span>
                                  </>
                                ) : (
                                  <>
                                    <i className="fa-solid fa-circle-xmark text-rose-500 text-xl"></i>
                                    <span>{t('تحتاج إلى تدقيق ومراجعة 💡')}</span>
                                  </>
                                )}
                              </div>
                              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-white/90 border border-slate-200 text-slate-700 shadow-xs">
                                {shortAnswerEvaluation?.evaluationMethod === 'lexical' ? (uiLanguage === 'ar' ? 'تطابق الكلمات: ' : 'Word match: ') : (uiLanguage === 'ar' ? 'تقدير AI: ' : 'AI estimate: ')}{shortAnswerEvaluation?.similarityScore || 0}%
                              </span>
                            </div>

                            {/* تعليق الذكاء الاصطناعي وتوضيحه للتسامح أو النقص */}
                            <div className="bg-white/95 p-3.5 rounded-xl border border-slate-200 mt-2 text-xs sm:text-sm leading-relaxed text-slate-800 font-semibold shadow-xs">
                              <div className="flex items-center gap-1.5 text-indigo-700 text-xs font-black mb-1">
                                <i className="fa-solid fa-robot"></i> {shortAnswerEvaluation?.evaluationMethod === 'lexical' ? (uiLanguage === 'ar' ? 'تقدير لفظي محلي؛ ليس فهماً للمعنى أو نسبة يقين:' : 'Local lexical estimate; not semantic understanding or certainty:') : (uiLanguage === 'ar' ? 'ملاحظة AI؛ قد يخطئ التقييم:' : 'AI feedback; the assessment may be wrong:')}
                              </div>
                              <p dir="auto">{shortAnswerEvaluation?.uiFeedback
                                ? (/^(ar|en)(-|$)/i.test(shortAnswerEvaluation.language)
                                  ? translateUi(shortAnswerEvaluation.feedback, {}, shortAnswerEvaluation.language.toLowerCase().startsWith('ar') ? 'ar' : 'en')
                                  : shortAnswerEvaluation.revisedAnswer)
                                : shortAnswerEvaluation?.feedback}</p>
                            </div>

                            {/* الإجابة النموذجية المعتمدة */}
                            <div className="mt-2.5 bg-indigo-50/80 p-3 rounded-xl border border-indigo-200 text-xs sm:text-sm text-indigo-950 flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <span className="font-black block text-indigo-700 text-xs mb-0.5">
                                  <i className="fa-solid fa-bullseye ml-1"></i> {t('الإجابة النموذجية المعتمدة:')}
                                </span>
                                <span dir="auto" className="font-bold">{shuffledQuestions[currentIndex].expectedAnswer}</span>
                              </div>
                              {renderSpeakerButton(shuffledQuestions[currentIndex].expectedAnswer, 'text-indigo-600 hover:text-indigo-800')}
                            </div>

                            {/* النص الأصلي للطالب والصياغة السليمة المقترحة */}
                            <div className="mt-2 text-[11px] text-slate-500 font-medium bg-white/60 p-2.5 rounded-lg border border-slate-200/60 space-y-1">
                              <div>
                                <span className="font-bold text-slate-700">{t('إجابتك المدخلة:')} </span>
                                <span dir="auto">"{studentShortAnswer}"</span>
                              </div>
                              {shortAnswerEvaluation?.revisedAnswer && shortAnswerEvaluation.revisedAnswer !== studentShortAnswer.trim() && (
                                <div className="text-indigo-700 pt-1 border-t border-slate-200/50">
                                  <span className="font-bold text-indigo-800">{t('الصياغة السليمة المقترحة:')} </span>
                                  <span dir="auto">"{shortAnswerEvaluation.revisedAnswer}"</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <button type="button"
                            onClick={handleNextQuestion}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition shadow-md shadow-indigo-100 flex items-center justify-center gap-2 cursor-pointer text-sm"
                          >
                            {currentIndex < shuffledQuestions.length - 1 ? (
                              <>
                                <span>{t('السؤال التالي')}</span>
                                <i className="fa-solid fa-chevron-left"></i>
                              </>
                            ) : (
                              <>
                                <span>{t('عرض النتيجة النهائية 🏆')}</span>
                                <i className="fa-solid fa-trophy"></i>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {!isShortAnswerQuestion(shuffledQuestions[currentIndex]) && isAnswerChecked && (
                    <div className={`mt-4 p-3 rounded-xl text-center font-bold text-sm shrink-0 animate-in fade-in duration-200 ${
                      selectedAnswer === shuffledQuestions[currentIndex].correct || (isFillBlankQuestion(shuffledQuestions[currentIndex]) && normalizeArabicText(fillBlankSelected) === normalizeArabicText(shuffledQuestions[currentIndex].missingWord || shuffledQuestions[currentIndex].expectedAnswer))
                        ? 'bg-emerald-100 text-emerald-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {(selectedAnswer === shuffledQuestions[currentIndex].correct || (isFillBlankQuestion(shuffledQuestions[currentIndex]) && normalizeArabicText(fillBlankSelected) === normalizeArabicText(shuffledQuestions[currentIndex].missingWord || shuffledQuestions[currentIndex].expectedAnswer)))
                        ? (consecutiveStreak >= 2 ? t('🔥 إجابات متتالية مقبولة في هذه الجولة x{count}!', {count: consecutiveStreak}) : t('إجابة عبقرية يا بطل! 🎉'))
                        : t('لا بأس، تذكر مفتاح الحفظ! 💡')}
                    </div>
                  )}
                </div>);
}
