import React from 'react';
import { getContentLanguage, normalizeArabicText, prepareQuizQuestions } from '../domain/questions.cjs';
const isFillBlankQuestion = q => q?.type === 'fill_blank';
const isShortAnswerQuestion = q => q?.type === 'short_answer';
const APP_CLIENT_VERSION = '1.3.0', APP_CLIENT_BUILD = '20261018-v130';
import { uiText } from '../i18n/index.js';
import { initAudio, playClick, playMemoryAnchor, playFlipTone, playSparkleTone, updatePinkNoiseLive } from '../services/audio.js';

export default function UploadView(props) {
  const { t, uiError, canGenerateMaterial, isAllowanceExhausted, openHeaderDialog, fileInputRef, formatFileSize, handleFilesSelected, handleRemoveFile, handleClearAllFiles, handleProcessAllFiles, handleTextSubmit, loadDemoQuestions, resumeGuestMaterial, renderAllowanceExhaustedOverlay, uiLanguage, playerName, errorMsg, authToken, setShowAuthModal, guestSavedMaterial, textInput, setTextInput, uploadTab, setUploadTab, selectedFiles, isProcessingFiles, isDragging, setIsDragging } = props;
  return (<div className="text-center space-y-6 my-auto">
                  <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto border-2 border-indigo-100 shadow-sm">
                    <i className="fa-solid fa-wand-magic-sparkles text-3xl"></i>
                  </div>
                  
                  <div>
                    <h1 data-study-heading tabIndex={-1} className="text-2xl font-black text-slate-800">{t('جاهز يا {name}؟ 🚀', {name: playerName || uiText('بطل')})}</h1>
                    <p className="text-slate-500 text-sm mt-1">{t('ارفع ورقة الدرس أو الصق النص وسأبتكر لك مفاتيح حفظ عبقرية!')}</p>
                  </div>

                  {errorMsg && (
                    <div className="p-3 bg-red-50 text-red-600 rounded-2xl flex items-center gap-2 justify-center text-sm font-bold border border-red-100">
                      <i className="fa-solid fa-circle-exclamation flex-shrink-0"></i>
                      <span>{uiError(errorMsg)}</span>
                    </div>
                  )}

                  {!authToken && (
                    <section aria-label={uiLanguage === 'ar' ? 'يلزم تسجيل الدخول للتوليد' : 'Sign-in required for generation'} className="p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-950 text-sm space-y-3">
                      <p>{uiLanguage === 'ar' ? 'إنشاء مواد جديدة بالذكاء الاصطناعي يتطلب تسجيل الدخول ورصيد مواد متاحاً وصلاحية من الخادم. لا يتوفر توليد جديد للزائر. تبقى دراسة المواد المحفوظة سابقاً على هذا الجهاز متاحة.' : 'New AI generation requires sign-in, available material allowance and server access. New guest generation is not available. Material previously saved on this device remains available to study.'}</p>
                      <button type="button" onClick={() => openHeaderDialog(setShowAuthModal)} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold">{t('تسجيل الدخول / إنشاء حساب')}</button>
                    </section>
                  )}
                  {!authToken && guestSavedMaterial && !isAllowanceExhausted && (
                    <button type="button" onClick={resumeGuestMaterial} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 transition text-sm font-bold">
                      <i aria-hidden="true" className="fa-solid fa-book-open"></i>
                      {t('متابعة المادة المحفوظة')}
                    </button>
                  )}

                  {/* تبويبات الاختيار: ملفات وصور متعددة أو نص */}
                  <div className="flex bg-slate-100 p-1 rounded-2xl max-w-sm mx-auto text-sm font-bold">
                    <button type="button"
                      onClick={() => setUploadTab('file')}
                      className={`flex-1 py-2 px-3 rounded-xl transition ${uploadTab === 'file' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                    >
                      <i className="fa-solid fa-layer-group ml-1.5"></i> {t('صور وملفات متعددة')}
                    </button>
                    <button type="button"
                      onClick={() => setUploadTab('text')}
                      className={`flex-1 py-2 px-3 rounded-xl transition ${uploadTab === 'text' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                    >
                      <i className="fa-solid fa-keyboard ml-1.5"></i> {t('لصق نص')}
                    </button>
                  </div>

                  {uploadTab === 'file' ? (
                    <div className={`relative rounded-3xl overflow-hidden ${isAllowanceExhausted ? 'min-h-[290px]' : ''}`}>
                      <input 
                        type="file" aria-label={t('اختر عدة صور أو مستندات معاً')} 
                        multiple
                        disabled={!canGenerateMaterial}
                        accept=".pdf,.docx,.jpg,.jpeg,.png,.webp,image/*,application/pdf" 
                        className="hidden" 
                        ref={fileInputRef} 
                        onChange={(e) => {
                          if (!canGenerateMaterial) return;
                          handleFilesSelected(e.target.files);
                          e.target.value = '';
                        }}
                      />

                      <div className={isAllowanceExhausted ? 'opacity-30 grayscale pointer-events-none select-none filter blur-[0.5px] transition-all duration-300' : ''}>
                        {selectedFiles.length === 0 ? (
                          <button type="button" disabled={!canGenerateMaterial}
                            onDragOver={(e) => { if (!canGenerateMaterial) return; e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={(e) => {
                              if (!canGenerateMaterial) return;
                              e.preventDefault();
                              setIsDragging(false);
                              handleFilesSelected(e.dataTransfer.files);
                            }}
                             aria-label={t('اختر عدة صور أو مستندات معاً')}
                            onClick={() => { if (!canGenerateMaterial) return; initAudio(); fileInputRef.current?.click(); }}
                            className={`w-full flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-3xl transition group cursor-pointer ${
                              isDragging 
                                ? 'border-indigo-600 bg-indigo-100/70 scale-[1.01]' 
                                : 'border-indigo-300 hover:border-indigo-500 bg-indigo-50/50 hover:bg-indigo-50'
                            }`}
                          >
                            <span className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform shadow-inner">
                              <i className="fa-solid fa-images text-2xl"></i>
                            </span>
                            <span className="text-center">
                              <span className="block font-black text-slate-800 text-lg">{t('اختر عدة صور أو مستندات معاً')}</span>
                              <span className="block text-xs font-semibold text-slate-500 mt-1">{t('يدعم اختيار عدة صور لصفحات الكتاب، PDF، أو مستندات Word')}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-white px-3 py-1.5 rounded-full shadow-sm border border-indigo-100">
                              <i className="fa-solid fa-plus-circle text-indigo-500"></i> {t('يدعم تحديد ودمج عدة ملفات في جلسة واحدة')}
                            </span>
                          </button>
                        ) : (
                          <div className="space-y-4 text-right">
                          {/* شريط الملخص وأزرار التحكم */}
                          <div className="flex items-center justify-between bg-indigo-50/80 border border-indigo-100 p-3 rounded-2xl">
                            <div className="flex items-center gap-2.5">
                              <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-sm">
                                {selectedFiles.length}
                              </span>
                              <div>
                                <span className="block text-xs font-bold text-slate-800">
                                  {selectedFiles.length === 1 ? t('ملف واحد جاهز للدمج') : t('{count} ملفات وصور جاهزة للدمج', {count: selectedFiles.length})}
                                </span>
                                <span className="block text-[11px] text-slate-500 font-medium">{t('سيتم توحيدها واستخراج الأسئلة منها كمنهج متكامل')}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button type="button"
                                onClick={() => { initAudio(); fileInputRef.current?.click(); }}
                                className="text-xs font-bold bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-xl transition flex items-center gap-1 cursor-pointer shadow-sm"
                                title={t('إضافة المزيد من الصور أو المستندات')}
                              >
                                <i className="fa-solid fa-plus"></i> {t('إضافة المزيد')}
                              </button>
                              <button type="button"
                                onClick={handleClearAllFiles}
                                className="text-xs font-bold text-slate-400 hover:text-red-500 p-1.5 rounded-xl hover:bg-red-50 transition cursor-pointer"
                                aria-label={t('مسح كافة الملفات')} title={t('مسح كافة الملفات')}
                              >
                                <i className="fa-solid fa-trash-can"></i>
                              </button>
                            </div>
                          </div>

                          {/* قائمة المرفقات المصغرة */}
                          <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                            {selectedFiles.map((item) => (
                              <div 
                                key={item.id}
                                className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-indigo-300 transition gap-3"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  {item.isImage && item.previewUrl ? (
                                    <img 
                                      src={item.previewUrl} 
                                      alt={item.name} 
                                      className="w-12 h-12 rounded-xl object-cover border border-slate-100 flex-shrink-0 shadow-sm"
                                    />
                                  ) : (
                                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 text-xl shadow-inner">
                                      {item.isPDF ? (
                                        <i className="fa-solid fa-file-pdf text-red-500"></i>
                                      ) : (
                                        <i className="fa-solid fa-file-word text-blue-600"></i>
                                      )}
                                    </div>
                                  )}

                                  <div className="min-w-0">
                                    <span dir="auto" className="block text-xs font-bold text-slate-800 truncate" title={item.name}>
                                      {item.name}
                                    </span>
                                    <span className="block text-[11px] text-slate-400 font-medium">
                                      {t(item.isImage ? 'صورة تعليمية' : item.isPDF ? 'مستند PDF' : 'مستند Word')} • {formatFileSize(item.size)}
                                    </span>
                                  </div>
                                </div>

                                <button type="button"
                                  onClick={() => handleRemoveFile(item.id)}
                                  className="text-slate-400 hover:text-red-500 p-2 rounded-xl hover:bg-red-50 transition cursor-pointer flex-shrink-0"
                                  aria-label={t('حذف هذا الملف')} title={t('حذف هذا الملف')}
                                >
                                  <i className="fa-solid fa-xmark"></i>
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* زر بدء الدمج والتوليد الذكي */}
                          <button type="button"
                            onClick={handleProcessAllFiles}
                            disabled={isProcessingFiles || !canGenerateMaterial}
                            className="w-full bg-gradient-to-l from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white py-4 rounded-2xl font-black text-base transition shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.99]"
                          >
                            {isProcessingFiles ? (
                              <>
                                <i className="fa-solid fa-spinner fa-spin text-lg"></i>
                                <span>{t('جاري دمج وقراءة الملفات... ⏳')}</span>
                              </>
                            ) : (
                              <>
                                <span>{t('دمج المرفقات وبدء الاختبار الذكي ({count})', {count: selectedFiles.length})}</span>
                                <i className="fa-solid fa-wand-magic-sparkles text-amber-300"></i>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                      </div>

                      {/* الغطاء المعتم الرمادي عند نفاد حد المواد */}
                      {isAllowanceExhausted && renderAllowanceExhaustedOverlay()}
                    </div>
                  ) : (
                    <div className={`relative rounded-3xl overflow-hidden ${isAllowanceExhausted ? 'min-h-[290px]' : ''}`}>
                      <div className={isAllowanceExhausted ? 'opacity-30 grayscale pointer-events-none select-none filter blur-[0.5px] space-y-3 text-right transition-all duration-300' : 'space-y-3 text-right'}>
                        <textarea aria-label={t('لصق نص')}
                          rows="4" 
                          disabled={isAllowanceExhausted}
                          value={textInput}
                          onChange={(e) => setTextInput(e.target.value)}
                          dir="auto" placeholder={t('الصق نص الدرس أو ملخص الأسئلة هنا...')}
                          className="w-full p-3.5 border-2 border-slate-200 rounded-2xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm leading-relaxed"
                        ></textarea>
                        <button type="button"
                          onClick={handleTextSubmit}
                          disabled={!canGenerateMaterial || isProcessingFiles}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-2xl font-bold transition shadow-lg shadow-indigo-100"
                        >
                          {t('تحليل النص الذكي')} <i className="fa-solid fa-arrow-left mr-1"></i>
                        </button>
                      </div>

                      {/* الغطاء المعتم الرمادي عند نفاد حد المواد */}
                      {isAllowanceExhausted && renderAllowanceExhaustedOverlay()}
                    </div>
                  )}

                  {/* تجربة فورية بدون ملف */}
                  {!isAllowanceExhausted && (
                    <div className="pt-2 border-t border-slate-100">
                      <button type="button"
                        onClick={loadDemoQuestions}
                        className="text-indigo-600 hover:text-indigo-800 text-xs font-bold transition flex items-center justify-center gap-1 mx-auto"
                      >
                        <i className="fa-solid fa-bolt"></i> {t('لا تملك ملفاً الآن؟ جرب اختباراً نموذجياً سريعاً')}
                      </button>
                    </div>
                  )}
                </div>);
}
