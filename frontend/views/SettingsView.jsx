import React from 'react';
import { getContentLanguage, normalizeArabicText, prepareQuizQuestions } from '../domain/questions.cjs';
const isFillBlankQuestion = q => q?.type === 'fill_blank';
const isShortAnswerQuestion = q => q?.type === 'short_answer';
const { version: APP_CLIENT_VERSION, build: APP_CLIENT_BUILD } = require('../../release.cjs');
import { uiText } from '../i18n/index.js';
import { initAudio, playClick, playMemoryAnchor, playFlipTone, playSparkleTone, updatePinkNoiseLive } from '../services/audio.js';

export default function SettingsView(props) {
  const { t, renderLanguageToggle, legalTitles, openLegalPage, generationRef, refreshMaterialQuota, handleToggleMusic, handleSwitchBinauralMode, cancelPendingReservation, renderMaterialQuota, setShowSettings, musicEnabled, binauralMode, pinkNoiseEnabled, setPinkNoiseEnabled, pinkNoiseVolume, setPinkNoiseVolume, materialQuota, quotaLoading, quotaError } = props;
  return (<div data-study-dialog="settings" role="dialog" aria-modal="true" aria-label={t('إعدادات التطبيق المتقدمة')} tabIndex={-1} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200 max-h-[92vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                      <i className="fa-solid fa-sliders text-lg"></i>
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-800">{t('إعدادات التطبيق المتقدمة')}</h3>
                      <p className="text-[11px] text-slate-400">{t('تخصيص الصوت والموجات والتركيز')}</p>
                    </div>
                  </div>
                  <button type="button" aria-label={t('إغلاق')} onClick={() => setShowSettings(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer">
                    <i aria-hidden="true" className="fa-solid fa-xmark text-xl"></i>
                  </button>
                </div>

                <div className="flex items-center justify-between mb-4 text-sm font-bold text-slate-700">
                  <span>{t('لغة الواجهة')}</span>
                  {renderLanguageToggle(true)}
                </div>
                <div className="mb-4">
                  {renderMaterialQuota()}
                  {(quotaError || materialQuota?.pendingGenerationId || (!quotaLoading && !materialQuota)) && (
                    <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs font-bold">
                      <button type="button" disabled={quotaLoading} onClick={() => refreshMaterialQuota().catch(() => {})} className="px-3 py-2 rounded-xl text-indigo-700 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 transition disabled:opacity-50">{t('تحديث الحد')}</button>
                      {materialQuota?.pendingGenerationId && !generationRef.current && <button type="button" disabled={quotaLoading} onClick={cancelPendingReservation} className="px-3 py-2 rounded-xl text-rose-700 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-600 transition disabled:opacity-50">{t('إلغاء الحجز المعلق')}</button>}
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => openLegalPage('billing')} className="w-full mb-4 px-4 py-3 rounded-xl border border-slate-200 text-indigo-700 bg-slate-50 hover:bg-indigo-50 font-bold text-sm">{legalTitles.billing}</button>
                <h4 className="font-bold text-purple-700 mb-4">{t('الموجات الصوتية والتركيز')}</h4>
                







                <div className="space-y-4 text-sm">
                  {/* اختيار نمط الموجات الثنائية Binaural Beats Mode */}
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5 flex items-center gap-1.5">
                      <i className="fa-solid fa-brain text-purple-600"></i>
                      <span>{t('1. نمط الموجات الدماغية الثنائية (Binaural Beats):')}</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl font-bold text-xs">
                      <button type="button"
                        onClick={() => handleSwitchBinauralMode('gamma')}
                        className={`py-3 rounded-lg transition flex items-center justify-center gap-2 cursor-pointer ${binauralMode === 'gamma' ? 'bg-purple-600 text-white shadow-sm font-black' : 'text-slate-600 hover:text-slate-900'}`}
                      >
                        <i className="fa-solid fa-bolt text-xs"></i>
                        <span>{t('غاما 40Hz (صوت اختياري)')}</span>
                      </button>
                      <button type="button"
                        onClick={() => handleSwitchBinauralMode('alpha')}
                        className={`py-3 rounded-lg transition flex items-center justify-center gap-2 cursor-pointer ${binauralMode === 'alpha' ? 'bg-teal-600 text-white shadow-sm font-black' : 'text-slate-600 hover:text-slate-900'}`}
                      >
                        <i className="fa-solid fa-water text-xs"></i>
                        <span>{t('ألفا 10Hz (استرخاء)')}</span>
                      </button>
                    </div>
                  </div>

                  {/* إعدادات الضوضاء الوردية Pink Noise */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <i className="fa-solid fa-wind text-pink-500 text-base"></i>
                        <div>
                          <span className="font-bold text-slate-800 block text-xs sm:text-sm">{t('الضوضاء الوردية (Pink Noise):')}</span>
                          <span className="text-[11px] text-slate-500">{t('طبقة صوتية دافئة تعزل التشويش والضوضاء الخارجية')}</span>
                        </div>
                      </div>
                      <button type="button"
                        onClick={() => {
                          const nextVal = !pinkNoiseEnabled;
                          setPinkNoiseEnabled(nextVal);
                          updatePinkNoiseLive(nextVal, pinkNoiseVolume);
                        }}
                        className={`px-3 py-1.5 rounded-xl font-black text-xs transition flex items-center gap-1.5 cursor-pointer ${
                          pinkNoiseEnabled ? 'bg-pink-600 text-white shadow-sm' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        <i className={`fa-solid ${pinkNoiseEnabled ? 'fa-circle-check' : 'fa-circle-xmark'}`}></i>
                        <span>{pinkNoiseEnabled ? t('مفعّلة') : t('معطلة')}</span>
                      </button>
                    </div>

                    {pinkNoiseEnabled && (
                      <div className="pt-2 border-t border-slate-200 space-y-1.5 animate-in fade-in duration-200">
                        <div className="flex justify-between items-center text-xs font-bold text-slate-600">
                          <span>{t('مستوى صوت الضوضاء الوردية:')}</span>
                          <span className="font-mono text-pink-700 bg-pink-100 px-2 py-0.5 rounded-md">{Math.round(pinkNoiseVolume * 100)}%</span>
                        </div>
                        <input
                          aria-label={t('مستوى صوت الضوضاء الوردية:')} type="range"
                          min="0.01"
                          max="0.25"
                          step="0.01"
                          value={pinkNoiseVolume}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setPinkNoiseVolume(val);
                            updatePinkNoiseLive(pinkNoiseEnabled, val);
                          }}
                          className="w-full accent-pink-600 cursor-pointer"
                        />
                      </div>
                    )}
                  </div>

                  {/* زر تشغيل وتجربة الصوت المحيطي فورياً */}
                  <div className="p-3.5 bg-gradient-to-r from-purple-50 via-indigo-50 to-pink-50 rounded-2xl border border-purple-200 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center text-sm shadow-xs">
                        <i className={`fa-solid ${musicEnabled ? 'fa-pause' : 'fa-headphones'}`}></i>
                      </div>
                      <div>
                        <span className="font-black text-purple-950 block text-xs">{t('معاينة الصوت والتركيز:')}</span>
                        <span className="text-[11px] text-purple-800 font-medium">
                          {musicEnabled ? t('الموجات تعمل الآن في الخلفية 🎧') : t('انقر لتجربة واستماع الصوت المهدئ فوراً')}
                        </span>
                      </div>
                    </div>
                    <button type="button"
                      onClick={handleToggleMusic}
                      className={`px-3 py-2 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-sm ${
                        musicEnabled 
                          ? 'bg-rose-500 hover:bg-rose-600 text-white' 
                          : 'bg-purple-600 hover:bg-purple-700 text-white'
                      }`}
                    >
                      <i className={`fa-solid ${musicEnabled ? 'fa-stop' : 'fa-play'}`}></i>
                      <span>{musicEnabled ? t('إيقاف الصوت') : t('تشغيل وتجربة')}</span>
                    </button>
                  </div>

                  {/* بطاقات الشرح العلمي المبسط للطلاب */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-[11px] space-y-2.5 text-slate-600 leading-relaxed">
                    <div className="flex items-start gap-2">
                      <span className="text-purple-700 font-black shrink-0 text-sm">{t('🧠 غاما 40Hz:')}</span>
                      <span>{t('أصوات اختيارية للتركيز؛ لا تضمن تحسين الذاكرة.')}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-teal-700 font-black shrink-0 text-sm">{t('🌊 ألفا 10Hz:')}</span>
                      <span>{t('قد يساعدك على الاسترخاء؛ تختلف التجربة من شخص لآخر.')}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-pink-700 font-black shrink-0 text-sm">{t('🌸 الضوضاء الوردية:')}</span>
                      <span>{t('قد تخفف الإحساس بالضوضاء المحيطة، لكنها لا تعزلها تماماً.')}</span>
                    </div>
                    <div className="p-2 bg-indigo-50/70 border border-indigo-100 rounded-xl text-indigo-900 font-bold flex items-center gap-2">
                      <i className="fa-solid fa-headphones text-indigo-600 text-xs"></i>
                      <span>{t('💡 استخدم سماعات الأذن بمستوى صوت مريح لسماع فرق التردد بين القناتين؛ أوقف الصوت إذا سبب انزعاجاً.')}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 mt-4">
                  <p className="text-xs text-slate-500 mb-3">{t('تطبق الإعدادات فوراً.')}</p>
                  <button type="button" onClick={() => setShowSettings(false)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">
                    {t('إغلاق')}
                  </button>
                </div>
              </div>
            </div>);
}
