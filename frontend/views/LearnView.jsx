import React from 'react';
import { getContentLanguage, normalizeArabicText, prepareQuizQuestions } from '../domain/questions.cjs';
const getMagicalMemorySecretSpeech = q => [q?.hint, q?.visualSketch, q?.whyExplanation].filter(Boolean).join('، ');
const getOptionLetter = (index, question) => (getContentLanguage(question).startsWith('ar') ? ['أ','ب','ج','د','هـ','و'] : ['A','B','C','D','E','F'])[index] || String(index + 1);
const isFillBlankQuestion = q => q?.type === 'fill_blank';
const isShortAnswerQuestion = q => q?.type === 'short_answer';
const APP_CLIENT_VERSION = '1.3.0', APP_CLIENT_BUILD = '20261018-v130';
import { uiText } from '../i18n/index.js';
import { initAudio, playClick, playMemoryAnchor, playFlipTone, playSparkleTone, updatePinkNoiseLive } from '../services/audio.js';

export default function LearnView(props) {
  const { navigateLearn, t, saveProgressToDb, speak, renderSpeakerButton, handleStartOverStudy, startQuiz, handleMarkCardMastered, handleMarkCardNeedsReview, questionsData, currentIndex, setCurrentIndex, showHint, setShowHint, score, soundEnabled, isAnswerRevealed, setIsAnswerRevealed, setShowWhy, authToken, currentMaterialId } = props;
  return (<div className="flex flex-col h-full">
                  {/* شريط رأس بطاقة التعلم */}
                  <div className="flex justify-between items-center mb-3 text-slate-500 font-bold text-xs sm:text-sm shrink-0 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-xl">
                        {t('السؤال {current} من {total}', {current: currentIndex + 1, total: questionsData.length})}
                      </span>
                      {questionsData[currentIndex].isReviewQueue && (
                        <span className="bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-lg text-[11px] font-black animate-pulse flex items-center gap-1">
                          <i className="fa-solid fa-bullseye"></i> {t('جولة تثبيت سريعة')}
                        </span>
                      )}
                      {questionsData[currentIndex].coreConcept && (
                        <span className="hidden sm:inline-flex bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-0.5 rounded-lg text-[11px] font-bold items-center gap-1">
                          <i className="fa-solid fa-tag text-[10px]"></i> {questionsData[currentIndex].coreConcept}
                        </span>
                      )}
                      <button type="button"
                        onClick={handleStartOverStudy}
                        className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition cursor-pointer"
                        aria-label={t('البدء من السؤال الأول')} title={t('البدء من السؤال الأول')}
                      >
                        <i className="fa-solid fa-rotate-left text-[10px]"></i> {t('إعادة')}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* زر تشغيل الرنين الذاكرتي التوافقي TMR */}
                      <button type="button"
                        onClick={() => { initAudio(); playMemoryAnchor(questionsData[currentIndex].soundAnchorId || currentIndex); }}
                        className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-2 py-1 rounded-xl transition flex items-center gap-1 cursor-pointer"
                        aria-label={t('استمع للرنين الذاكرتي الخاص بهذا السؤال (Targeted Memory Reactivation)')} title={t('استمع للرنين الذاكرتي الخاص بهذا السؤال (Targeted Memory Reactivation)')}
                      >
                        <i className="fa-solid fa-bell text-[10px]"></i> {t('رنين الذاكرة')}
                      </button>

                      <button type="button"
                        onClick={startQuiz}
                        className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-black px-3 py-1.5 rounded-xl shadow-sm hover:shadow transition flex items-center gap-1.5 cursor-pointer"
                        aria-label={t('الانتقال فوراً للاختبار')} title={t('الانتقال فوراً للاختبار')}
                      >
                        <i className="fa-solid fa-play text-[10px]"></i> {t('بدء الاختبار')}
                      </button>
                    </div>
                  </div>
                  
                  {/* جسم بطاقة السؤال والاسترجاع النشط */}
                  <div className="flex-1 flex flex-col gap-3.5 overflow-y-auto pr-1">
                    <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 text-right shadow-sm shrink-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1">
                          {isFillBlankQuestion(questionsData[currentIndex]) ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-teal-100 text-teal-800 mb-2">
                              <i className="fa-solid fa-wand-magic"></i> {t('إكمال الفراغ والتوليد النشط (Cloze Deletion)')}
                            </span>
                          ) : isShortAnswerQuestion(questionsData[currentIndex]) ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-100 text-indigo-700 mb-2">
                              <i className="fa-solid fa-pen-nib"></i> {t('سؤال إجابة قصيرة وتعليل (Short Answer)')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-blue-700 mb-2">
                              <i className="fa-solid fa-list-check"></i> {t('سؤال اختيار من متعدد (MCQ)')}
                            </span>
                          )}

                          <h2 data-study-heading tabIndex={-1} dir="auto" className="text-lg sm:text-xl font-bold text-slate-800 leading-relaxed">
                            {isFillBlankQuestion(questionsData[currentIndex]) && !isAnswerRevealed
                              ? (questionsData[currentIndex].clozeText || questionsData[currentIndex].text)
                              : questionsData[currentIndex].text}
                          </h2>
                        </div>
                        {renderSpeakerButton(questionsData[currentIndex])}
                      </div>

                      {/* آلية الاسترجاع النشط وكشف الستار (Active Recall & Prediction Scaffolding) */}
                      {!isAnswerRevealed ? (
                        <button type="button" aria-label={t('كشف الإجابة')}
                          onClick={() => {
                            if (soundEnabled) playFlipTone();
                            setIsAnswerRevealed(true);
                            if (questionsData[currentIndex].expectedAnswer) {
                              speak(questionsData[currentIndex].expectedAnswer, false, getContentLanguage(questionsData[currentIndex]));
                            }
                          }}
                          className="mt-3 p-5 rounded-2xl border-2 border-dashed border-indigo-300 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/70 hover:from-indigo-100/60 hover:to-purple-100/60 text-center cursor-pointer transition-all duration-300 shadow-xs hover:shadow-md active:scale-[0.99] group select-none"
                        >
                          <span className="block w-12 h-12 mx-auto mb-2 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-xl shadow-md group-hover:scale-110 transition-transform">
                            <i className="fa-solid fa-eye-slash group-hover:hidden"></i>
                            <i className="fa-solid fa-eye hidden group-hover:inline-block"></i>
                          </span>
                          <span className="block text-base font-black text-indigo-950 mb-1">
                            {t('توقع الإجابة في سرك أولاً 💭 ثم انقر لكشف السر! ✨')}
                          </span>
                          <span className="block text-xs font-semibold text-indigo-600/80">
                            {t('حاول استرجاع الإجابة قبل كشفها؛ قد يساعد ذلك على التعلم.')}
                          </span>
                        </button>
                      ) : (
                        /* الإجابة المكشوفة بوضوح بعد المحاولة الذهنية النشطة */
                        <div className="mt-3 space-y-3 animate-in fade-in zoom-in-95 duration-200">
                          {isFillBlankQuestion(questionsData[currentIndex]) ? (
                            <div className="p-4 rounded-2xl border-2 border-teal-300 bg-teal-50/80 text-teal-950 text-right space-y-2">
                              <span className="text-xs font-black text-teal-800 flex items-center gap-1.5">
                                <i className="fa-solid fa-circle-check text-teal-600"></i> {t('الكلمة المفتاحية المفقودة:')}
                              </span>
                              <div dir="auto" className="text-lg font-black text-teal-900 bg-white/90 p-3 rounded-xl border border-teal-200 inline-block shadow-xs">
                                🌟 {questionsData[currentIndex].missingWord || questionsData[currentIndex].expectedAnswer}
                              </div>
                            </div>
                          ) : !isShortAnswerQuestion(questionsData[currentIndex]) ? (
                            <div className="space-y-2">
                              {questionsData[currentIndex].options.map((opt, i) => (
                                <div 
                                  key={i}
                                  dir={getContentLanguage(questionsData[currentIndex]).startsWith('ar') ? 'rtl' : 'ltr'} data-material-text lang={getContentLanguage(questionsData[currentIndex])}
                                  className={`p-3 rounded-xl border font-medium transition flex items-center gap-2 ${
                                    i === questionsData[currentIndex].correct 
                                      ? 'bg-emerald-50 border-emerald-400 text-emerald-800 font-bold shadow-sm' 
                                      : 'bg-white border-slate-200 text-slate-400 opacity-60'
                                  }`}
                                >
                                  <div className="flex flex-1 min-w-0 items-center gap-2">
                                    <bdi className="font-black shrink-0">({getOptionLetter(i, questionsData[currentIndex])})</bdi>
                                    <bdi className="flex-1 min-w-0 break-words">{opt}</bdi>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {i === questionsData[currentIndex].correct && (
                                      <i className="fa-solid fa-circle-check text-emerald-500 text-lg"></i>
                                    )}
                                    <button type="button"
                                      onClick={(e) => { e.stopPropagation(); speak(opt, true, getContentLanguage(questionsData[currentIndex])); }}
                                      className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                                      title={t('استمع للخيار')} aria-label={t('استمع للخيار')}
                                    >
                                      <i aria-hidden="true" className="fa-solid fa-volume-low text-xs"></i>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50/80 text-emerald-950 shadow-sm text-right space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-emerald-800 flex items-center gap-1.5">
                                  <i className="fa-solid fa-bullseye text-emerald-600"></i> {t('الإجابة النموذجية المعتمدة:')}
                                </span>
                                {renderSpeakerButton(questionsData[currentIndex].expectedAnswer, 'text-emerald-700 hover:text-emerald-900')}
                              </div>
                              <p dir="auto" className="text-base sm:text-lg font-bold leading-relaxed text-slate-800">
                                {questionsData[currentIndex].expectedAnswer}
                              </p>
                            </div>
                          )}

                          {/* أزرار التقييم والتثبيت الخفي (Stealth Spaced Repetition / Metacognitive Calibration) */}
                          <div className="pt-2 flex items-center gap-2 border-t border-slate-200">
                            <span className="text-[11px] font-bold text-slate-500 ml-auto hidden sm:inline">{t('تقييمك الذاتي السريع:')}</span>
                            <button type="button"
                              onClick={handleMarkCardMastered}
                              className="flex-1 sm:flex-initial text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-black px-3.5 py-2 rounded-xl transition shadow-sm hover:shadow flex items-center justify-center gap-1.5 cursor-pointer"
                              aria-label={t('حفظت المعلومة وأصبحت راسخة في ذهني')} title={t('حفظت المعلومة وأصبحت راسخة في ذهني')}
                            >
                              <i className="fa-solid fa-bolt text-amber-300"></i> {t('حفظتها وسهلة! 🚀')}
                            </button>
                            <button type="button"
                              onClick={handleMarkCardNeedsReview}
                              className="flex-1 sm:flex-initial text-xs bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-bold px-3 py-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                              aria-label={t('كرر لي هذه البطاقة بعد سؤالين لترسيخها بدون قلق')} title={t('كرر لي هذه البطاقة بعد سؤالين لترسيخها بدون قلق')}
                            >
                              <i className="fa-solid fa-arrows-rotate text-purple-600"></i> {t('كررها لي لاحقاً 🔄')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* زر وبطاقة مفتاح الحفظ السحري (Voice assistant Mnemonic Key, Visual Link & Idea) */}
                    {!showHint ? (
                      <button type="button"
                        onClick={() => {
                          if (soundEnabled) { playClick(); playSparkleTone(); }
                          setShowHint(true);
                          const secretSpeech = getMagicalMemorySecretSpeech(questionsData[currentIndex]);
                          speak(secretSpeech, true, getContentLanguage(questionsData[currentIndex]));
                        }}
                        className="w-full py-3.5 bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-500 hover:to-orange-500 text-amber-950 font-black text-sm sm:text-base rounded-2xl transition flex justify-center items-center gap-2 shadow-md active:scale-95 shrink-0 cursor-pointer"
                      >
                        <i className="fa-solid fa-wand-magic-sparkles"></i> {t('اضغط لاكتشاف السر السحري للحفظ! 🪄')}
                      </button>
                    ) : (
                      <div dir="auto" className="p-4 sm:p-5 bg-gradient-to-br from-amber-50 via-orange-50 to-purple-50 border-2 border-amber-300 rounded-3xl text-slate-800 shadow-md shrink-0 space-y-3.5 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between pb-2 border-b border-amber-200/70">
                          <div className="flex items-center gap-2 text-amber-900 font-black text-sm sm:text-base">
                            <i className="fa-solid fa-wand-magic-sparkles text-amber-500"></i>
                            <span>{t('سر الحفظ السحري 🪄')}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {renderSpeakerButton(getMagicalMemorySecretSpeech(questionsData[currentIndex]), 'text-amber-800 hover:text-amber-950')}
                            <button type="button"
                              onClick={() => setShowHint(false)}
                              className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-amber-100/60 flex items-center justify-center transition cursor-pointer text-xs"
                              aria-label={t('إخفاء')} title={t('إخفاء')}
                            >
                              <i className="fa-solid fa-chevron-up"></i>
                            </button>
                          </div>
                        </div>

                        {/* مفتاح الحفظ (Hint / Mnemonic) */}
                        {questionsData[currentIndex]?.hint && (
                          <div className="p-3.5 rounded-2xl bg-white/80 border border-amber-200 text-amber-950 text-right text-xs sm:text-sm leading-relaxed shadow-xs">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-black text-amber-900 flex items-center gap-1.5">
                                <span>✨</span> {t('مفتاح الحفظ:')}
                              </span>
                              {renderSpeakerButton(questionsData[currentIndex].hint, 'text-amber-700 hover:text-amber-900 -mt-1')}
                            </div>
                            <p dir="auto" lang={getContentLanguage(questionsData[currentIndex])} className="font-extrabold text-amber-950 text-sm sm:text-base leading-relaxed">
                              {questionsData[currentIndex].hint}
                            </p>
                          </div>
                        )}

                        {/* الرابط البصري التخيلي (Imaginary visual link) */}
                        {questionsData[currentIndex]?.visualSketch && (
                          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-50 via-indigo-50 to-pink-50 border border-purple-200 text-purple-950 text-right text-xs sm:text-sm leading-relaxed shadow-xs">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-black text-purple-900 flex items-center gap-1.5">
                                <span className="text-base">🎨</span> {t('الرابط البصري التخيلي (تخيل المشهد بعينيك الآن):')}
                              </span>
                              {renderSpeakerButton(questionsData[currentIndex].visualSketch, 'text-purple-700 hover:text-purple-900 -mt-1')}
                            </div>
                            <p dir="auto" lang={getContentLanguage(questionsData[currentIndex])} className="font-bold text-slate-800 text-xs sm:text-sm leading-relaxed">
                              {questionsData[currentIndex].visualSketch}
                            </p>
                          </div>
                        )}

                        {/* سر الفكرة والتعليل الذاتي (The idea behind it) */}
                        {questionsData[currentIndex]?.whyExplanation && (
                          <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200/90 text-amber-950 text-right text-xs sm:text-sm leading-relaxed shadow-xs">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-black text-amber-900 flex items-center gap-1.5">
                                <span className="text-base">💡</span> {t('سر الفكرة (لماذا؟):')}
                              </span>
                              {renderSpeakerButton(questionsData[currentIndex].whyExplanation, 'text-amber-800 hover:text-amber-950 -mt-1')}
                            </div>
                            <p dir="auto" lang={getContentLanguage(questionsData[currentIndex])} className="font-bold text-amber-950/90 text-xs sm:text-sm leading-relaxed">
                              {questionsData[currentIndex].whyExplanation}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* أزرار التنقل السفلية */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 shrink-0 gap-2">
                    <button type="button"
                      onClick={() => navigateLearn(-1)}
                      disabled={currentIndex === 0}
                      className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl disabled:opacity-40 transition cursor-pointer"
                      aria-label={t('السؤال السابق')} title={t('السؤال السابق')}
                    >
                      <i className="fa-solid fa-chevron-right"></i>
                    </button>

                    <button type="button"
                      onClick={startQuiz}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl transition shadow-md shadow-emerald-100 flex items-center justify-center gap-1.5 text-xs sm:text-sm whitespace-nowrap cursor-pointer"
                      aria-label={t('بدء الاختبار فوراً دون إكمال بقية الأسئلة')} title={t('بدء الاختبار فوراً دون إكمال بقية الأسئلة')}
                    >
                      <i className="fa-solid fa-bolt"></i> {t('بدء الاختبار فوراً')}
                    </button>
                    
                    {currentIndex === questionsData.length - 1 ? (
                      <button type="button"
                        onClick={startQuiz} 
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition shadow-md shadow-emerald-100 text-sm flex items-center justify-center gap-1 cursor-pointer"
                      >
                        {t('أنا جاهز للاختبار!')} <i className="fa-solid fa-play mr-1"></i>
                      </button>
                    ) : (
                      <button type="button"
                        onClick={() => navigateLearn(1)}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition shadow-md shadow-indigo-100 text-sm flex items-center justify-center gap-1 cursor-pointer"
                      >
                        {t('السؤال التالي')} <i className="fa-solid fa-chevron-left mr-1"></i>
                      </button>
                    )}
                  </div>
                </div>);
}
