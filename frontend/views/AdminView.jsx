import React from 'react';
import { getContentLanguage, normalizeArabicText, prepareQuizQuestions } from '../domain/questions.cjs';
const isFillBlankQuestion = q => q?.type === 'fill_blank';
const isShortAnswerQuestion = q => q?.type === 'short_answer';
const { version: APP_CLIENT_VERSION, build: APP_CLIENT_BUILD } = require('../../release.cjs');
import { uiText } from '../i18n/index.js';
import { initAudio, playClick, playMemoryAnchor, playFlipTone, playSparkleTone, speakText, updatePinkNoiseLive } from '../services/audio.js';

export default function AdminView(props) {
  const { t, fetchAdminAiSettings, handleSaveAiSettings, handleTestAiConnection, fetchAdminVersion, handleSaveVersion, fetchAdminData, handleSaveUserQuota, adminDbVersion, adminVersionForm, setAdminVersionForm, isSavingVersion, versionSaveMsg, setShowAdminDashboard, adminQuotaEdits, setAdminQuotaEdits, savingQuotaUser, adminTab, setAdminTab, adminUsers, adminStats, adminAiSettings, setAdminAiSettings, isSavingAiSettings, aiSettingsSaveMsg, testingAi, aiTestResult, showBrainKey, setShowBrainKey, showGeminiKey, setShowGeminiKey, showVertexKey, setShowVertexKey } = props;
  return (<div data-study-dialog="admin" role="dialog" aria-modal="true" aria-label={t('لوحة المشرف')} tabIndex={-1} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-6 text-white flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl border border-white/20">
                      <i className="fa-solid fa-crown text-amber-200"></i>
                    </div>
                    <div>
                      <h3 className="text-xl font-black">{t('لوحة تحكم المشرف (Admin Control)')}</h3>
                      <p className="text-xs text-amber-100 mt-0.5">
                        {t('إدارة المستخدمين، التحكم بصلاحيات الذكاء الاصطناعي، ومراقبة الاستهلاك في VPS')}
                      </p>
                    </div>
                  </div>
                  <button type="button"
                    onClick={() => setShowAdminDashboard(false)}
                    aria-label={t('إغلاق')}
                    className="text-white/80 hover:text-white text-xl w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition cursor-pointer"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>

                {/* Navigation Tabs */}
                <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2 shrink-0">
                  <button type="button"
                    onClick={() => setAdminTab('users')}
                    className={`pb-3 px-4 font-black text-xs sm:text-sm flex items-center gap-2 border-b-2 transition cursor-pointer ${
                      adminTab === 'users'
                        ? 'border-amber-500 text-amber-800 bg-white rounded-t-xl shadow-xs'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <i className="fa-solid fa-users"></i>
                    <span>{t('المستخدمون والإحصائيات')}</span>
                  </button>
                  <button type="button"
                    onClick={() => { setAdminTab('ai_settings'); fetchAdminAiSettings(); }}
                    className={`pb-3 px-4 font-black text-xs sm:text-sm flex items-center gap-2 border-b-2 transition cursor-pointer ${
                      adminTab === 'ai_settings'
                        ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-xl shadow-xs'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <i className="fa-solid fa-brain text-indigo-500"></i>
                    <span>{t('إعدادات الذكاء الاصطناعي والمفاتيح')}</span>
                  </button>
                  <button type="button"
                    onClick={() => { setAdminTab('version'); fetchAdminVersion(); }}
                    className={`pb-3 px-4 font-black text-xs sm:text-sm flex items-center gap-2 border-b-2 transition cursor-pointer ${
                      adminTab === 'version'
                        ? 'border-emerald-600 text-emerald-700 bg-white rounded-t-xl shadow-xs'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <i className="fa-solid fa-code-branch text-emerald-500"></i>
                    <span>{t('إصدار التطبيق والتحديث التلقائي')}</span>
                  </button>
                </div>

                {/* Body Content */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
                  {adminTab === 'users' && (
                    <div className="space-y-6">
                      {/* Stats Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                          <p className="text-xs text-slate-500 font-bold mb-1">{t('إجمالي المستخدمين')}</p>
                          <p className="text-2xl font-black text-slate-800">{adminStats?.totalUsers ?? adminUsers.length}</p>
                        </div>
                        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-center">
                          <p className="text-xs text-emerald-600 font-bold mb-1">{t('صلاحية AI نشطة')}</p>
                          <p className="text-2xl font-black text-emerald-700">{adminStats?.serverAiUsers ?? adminUsers.filter(u => u.has_server_ai_access).length}</p>
                        </div>
                        <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-200 text-center">
                          <p className="text-xs text-indigo-600 font-bold mb-1">{t('طلبات AI المنفذة')}</p>
                          <p className="text-2xl font-black text-indigo-700">{adminStats?.totalAiCalls ?? 0}</p>
                        </div>
                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-center">
                          <p className="text-xs text-amber-600 font-bold mb-1">{t('المواد المحفوظة')}</p>
                          <p className="text-2xl font-black text-amber-700">{adminStats?.totalMaterials ?? 0}</p>
                        </div>
                      </div>

                      {/* Users Table & AI Access Management */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-black text-slate-800 text-base flex items-center gap-2">
                            <i className="fa-solid fa-users-gear text-amber-600"></i>
                            {t('إدارة المستخدمين ومنح صلاحيات السيرفر')}
                          </h4>
                          <button type="button"
                            onClick={fetchAdminData}
                            className="text-xs text-amber-600 hover:text-amber-800 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <i className="fa-solid fa-arrows-rotate"></i>
                            {t('تحديث القائمة')}
                          </button>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-slate-200">
                          <table className="w-full text-right text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                              <tr>
                                <th className="p-3">{t('المستخدم')}</th>
                                <th className="p-3">{t('الحساب')}</th>
                                <th className="p-3 text-center">{t('طلبات AI')}</th>
                                <th className="p-3 text-center">{t('المواد المستخدمة / المتبقية')}</th>
                                <th className="p-3 text-center">{t('إجمالي المواد المسموح بها')}</th>
                                <th className="p-3 text-center">{t('الإجراء')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {adminUsers.map((u) => {
                                const isAdmin = u.role === 'admin';
                                const limit = isAdmin || u.material_limit === null ? null : Number(u.material_limit ?? 1);
                                const used = Number(u.materials_used ?? 0);
                                const edit = adminQuotaEdits[u.id] ?? (limit === null ? 'unlimited' : String(limit));

                                return (
                                  <tr key={u.id} className="hover:bg-slate-50/70 transition">
                                    <td className="p-3">
                                      <div className="font-bold text-slate-800 flex items-center gap-1.5">
                                        {isAdmin && <i className="fa-solid fa-crown text-amber-500 text-[10px]"></i>}
                                        <span dir="auto">{u.name || t('بدون اسم')}</span>
                                      </div>
                                      <div dir="auto" className="text-[11px] text-slate-400">{u.email}</div>
                                    </td>
                                    <td className="p-3">
                                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                        {u.auth_provider || 'local'}
                                      </span>
                                    </td>
                                    <td className="p-3 text-center font-bold text-slate-700">
                                      {u.ai_calls_count || 0}
                                    </td>
                                    <td className="p-3 text-center font-bold text-slate-700">
                                      {used} / {limit === null ? '∞' : Math.max(0, limit - used)}
                                    </td>
                                    <td className="p-3 text-center">
                                      <div className="flex flex-col items-center gap-2 min-w-[110px]">
                                        <label className="flex items-center gap-1 text-slate-700">
                                          <input type="checkbox" checked={edit === 'unlimited'} disabled={isAdmin}
                                            onChange={e => setAdminQuotaEdits(prev => ({ ...prev, [u.id]: e.target.checked ? 'unlimited' : String(limit ?? 1) }))} />
                                          {t('بلا حد')}
                                        </label>
                                        {edit !== 'unlimited' && <input type="number" min="0" max="4294967295" step="1" value={edit}
                                          aria-label={`${t('إجمالي المواد المسموح بها')} — ${u.name || u.email}`}
                                          onChange={e => setAdminQuotaEdits(prev => ({ ...prev, [u.id]: e.target.value }))}
                                          className="w-24 rounded-lg border border-slate-300 p-1.5 text-center focus:ring-2 focus:ring-amber-500 outline-none" />}
                                      </div>
                                    </td>
                                    <td className="p-3 text-center">
                                      <button type="button"
                                        onClick={() => handleSaveUserQuota(u)} disabled={isAdmin || savingQuotaUser !== null}
                                        className="px-3 py-1 rounded-xl text-[11px] font-bold transition cursor-pointer bg-amber-100 text-amber-900 hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {savingQuotaUser === u.id ? t('جاري الحفظ...') : t('حفظ الحد')}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {adminTab === 'ai_settings' && (
                    <div className="space-y-6">
                      {/* Top notice banner */}
                      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-start gap-3">
                        <i className="fa-solid fa-shield-halved text-indigo-600 text-lg mt-0.5"></i>
                        <div className="text-xs text-indigo-950 space-y-1">
                          <p className="font-bold">{t('إعدادات ومفاتيح الذكاء الاصطناعي (Database)')}</p>
                          <p className="text-indigo-800 leading-relaxed">{t('يتم حفظ هذه البيانات مباشرة وبأمان تام داخل جدول admin_settings في قاعدة بيانات السيرفر (MySQL).')}</p>
                        </div>
                      </div>

                      {/* Section 1: Brain (OmniRoute) */}
                      <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-2">
                          <h4 className="font-black text-slate-800 text-sm flex items-center gap-2">
                            <i className="fa-solid fa-microchip text-indigo-600"></i>
                            {t('المخ العصبي وتوليد الأسئلة (Brain / OmniRoute)')}
                          </h4>
                          <button type="button"
                            onClick={() => handleTestAiConnection('brain')}
                            disabled={testingAi === 'brain'}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <i className={`fa-solid ${testingAi === 'brain' ? 'fa-spinner fa-spin' : 'fa-bolt'}`}></i>
                            <span>{testingAi === 'brain' ? t('جاري فحص الاتصال...') : t('فحص اتصال المخ العصبي')}</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                          <div className="sm:col-span-2">
                            <label className="block font-bold text-slate-700 mb-1">{t('رابط الخدمة (Base URL):')}</label>
                            <input
                              type="text"
                              dir="ltr"
                              value={adminAiSettings.server_brain_url}
                              onChange={(e) => setAdminAiSettings(prev => ({ ...prev, server_brain_url: e.target.value }))}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              placeholder=""
                            />
                          </div>

                          <div>
                            <label className="block font-bold text-slate-700 mb-1">{t('مفتاح API الخاص بـ OmniRoute:')}</label>
                            <div className="relative">
                              <input
                                type={showBrainKey ? "text" : "password"}
                                dir="ltr"
                                value={adminAiSettings.server_brain_api_key}
                                onChange={(e) => setAdminAiSettings(prev => ({ ...prev, server_brain_api_key: e.target.value }))}
                                className="w-full pl-3 pr-9 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                placeholder="sk-..."
                              />
                              <button type="button"
                                onClick={() => setShowBrainKey(!showBrainKey)}
                                aria-label={t(showBrainKey ? 'إخفاء مفتاح API' : 'إظهار مفتاح API')}
                                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                              >
                                <i className={`fa-solid ${showBrainKey ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="block font-bold text-slate-700 mb-1">{t('اسم النموذج (Model):')}</label>
                            <input
                              type="text"
                              dir="ltr"
                              value={adminAiSettings.server_brain_model}
                              onChange={(e) => setAdminAiSettings(prev => ({ ...prev, server_brain_model: e.target.value }))}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              placeholder=""
                            />
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Voice TTS */}
                      <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-2">
                          <h4 className="font-black text-slate-800 text-sm flex items-center gap-2">
                            <i className="fa-solid fa-headset text-amber-600"></i>
                            {t('نطق الأسئلة والمساعد الصوتي (TTS / Voice):')}
                          </h4>
                          <button type="button"
                            onClick={() => handleTestAiConnection('tts')}
                            disabled={testingAi === 'tts'}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <i className={`fa-solid ${testingAi === 'tts' ? 'fa-spinner fa-spin' : 'fa-volume-high'}`}></i>
                            <span>{testingAi === 'tts' ? t('جاري فحص الاتصال...') : t('فحص اتصال الصوت')}</span>
                          </button>
                        </div>

                        <div className="space-y-4 text-xs">
                          <div>
                            <label className="block font-bold text-slate-700 mb-1">{t('مزود خدمة الصوت:')}</label>
                            <div className="grid grid-cols-2 gap-2 bg-slate-200/70 p-1 rounded-xl max-w-xs font-bold">
                              <button type="button"
                                onClick={() => setAdminAiSettings(prev => ({ ...prev, server_tts_provider: 'gemini' }))}
                                className={`py-2 rounded-lg transition ${adminAiSettings.server_tts_provider === 'gemini' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                              >
                                Google Gemini TTS
                              </button>
                              <button type="button"
                                onClick={() => setAdminAiSettings(prev => ({ ...prev, server_tts_provider: 'vertex' }))}
                                className={`py-2 rounded-lg transition ${adminAiSettings.server_tts_provider === 'vertex' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                              >
                                Google Vertex AI
                              </button>
                            </div>
                          </div>

                          {adminAiSettings.server_tts_provider === 'gemini' ? (
                            <div>
                              <label className="block font-bold text-slate-700 mb-1">{t('مفتاح Gemini API (للصوت):')}</label>
                              <div className="relative">
                                <input
                                  type={showGeminiKey ? "text" : "password"}
                                  dir="ltr"
                                  value={adminAiSettings.server_gemini_api_key}
                                  onChange={(e) => setAdminAiSettings(prev => ({ ...prev, server_gemini_api_key: e.target.value }))}
                                  className="w-full pl-3 pr-9 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                  placeholder="AIzaSy..."
                                />
                                <button type="button"
                                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                                  aria-label={t(showGeminiKey ? 'إخفاء مفتاح API' : 'إظهار مفتاح API')}
                                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                                >
                                  <i className={`fa-solid ${showGeminiKey ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-3">
                              <p className="font-bold text-slate-700">{t('إعدادات Vertex AI (Google Cloud):')}</p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-slate-600 mb-1">{t('معرف المشروع (Project ID):')}</label>
                                  <input
                                    type="text"
                                    dir="ltr"
                                    value={adminAiSettings.server_vertex_config?.project || ''}
                                    onChange={(e) => setAdminAiSettings(prev => ({ ...prev, server_vertex_config: { ...prev.server_vertex_config, project: e.target.value } }))}
                                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs"
                                    placeholder="my-gcp-project"
                                  />
                                </div>
                                <div>
                                  <label className="block text-slate-600 mb-1">{t('المنطقة (Region):')}</label>
                                  <input
                                    type="text"
                                    dir="ltr"
                                    value={adminAiSettings.server_vertex_config?.region || 'global'}
                                    onChange={(e) => setAdminAiSettings(prev => ({ ...prev, server_vertex_config: { ...prev.server_vertex_config, region: e.target.value } }))}
                                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs"
                                    placeholder="global"
                                  />
                                </div>
                                <div>
                                  <label className="block text-slate-600 mb-1">{t('مفتاح أو رمز الوصول (Key / Bearer Token):')}</label>
                                  <div className="relative">
                                    <input
                                      type={showVertexKey ? "text" : "password"}
                                      dir="ltr"
                                      value={adminAiSettings.server_vertex_config?.key || ''}
                                      onChange={(e) => setAdminAiSettings(prev => ({ ...prev, server_vertex_config: { ...prev.server_vertex_config, key: e.target.value } }))}
                                      className="w-full pl-2.5 pr-8 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs"
                                      placeholder="API Key or token"
                                    />
                                    <button type="button"
                                      onClick={() => setShowVertexKey(!showVertexKey)}
                                      aria-label={t(showVertexKey ? 'إخفاء مفتاح API' : 'إظهار مفتاح API')}
                                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                                    >
                                      <i className={`fa-solid ${showVertexKey ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block font-bold text-slate-700 mb-1">{t('نموذج الصوت (Voice Model):')}</label>
                              <input
                                type="text"
                                dir="ltr"
                                value={adminAiSettings.server_tts_model}
                                onChange={(e) => setAdminAiSettings(prev => ({ ...prev, server_tts_model: e.target.value }))}
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                placeholder="gemini-2.5-flash-preview-tts"
                              />
                            </div>
                            <div>
                              <label className="block font-bold text-slate-700 mb-1">{t('شخصية الصوت (Voice Persona):')}</label>
                              <select
                                value={adminAiSettings.server_tts_voice}
                                onChange={(e) => setAdminAiSettings(prev => ({ ...prev, server_tts_voice: e.target.value }))}
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              >
                                <option value="Aoede">{t('Aoede — الصوت الافتراضي')}</option>
                                <option value="Puck">{t('Puck — صوت حيوي')}</option>
                                <option value="Charon">{t('Charon — صوت رصين')}</option>
                                <option value="Kore">{t('Kore — صوت حازم')}</option>
                                <option value="Fenrir">{t('Fenrir — صوت متحمس')}</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Test Result Display */}
                      {aiTestResult && (
                        <div className={`p-4 rounded-2xl border text-xs leading-relaxed flex items-center gap-3 animate-in fade-in duration-200 ${
                          aiTestResult.success ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'
                        }`}>
                          <i className={`fa-solid text-base ${aiTestResult.success ? 'fa-circle-check text-emerald-600' : 'fa-circle-xmark text-rose-600'}`}></i>
                          <div className="flex-1 font-bold">{aiTestResult.message}</div>
                        </div>
                      )}

                      {/* Success message banner */}
                      {aiSettingsSaveMsg && (
                        <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2">
                          <i className="fa-solid fa-check"></i>
                          <span>{aiSettingsSaveMsg}</span>
                        </div>
                      )}

                      {/* Save button */}
                      <div className="pt-2">
                        <button type="button"
                          onClick={handleSaveAiSettings}
                          disabled={isSavingAiSettings}
                          className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-50 text-white font-black text-sm rounded-2xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <i className={`fa-solid ${isSavingAiSettings ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
                          <span>{isSavingAiSettings ? t('جاري الحفظ في MySQL...') : t('حفظ إعدادات الذكاء الاصطناعي في قاعدة البيانات (MySQL)')}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {adminTab === 'version' && (
                    <div className="space-y-6">
                      {/* Top notice banner */}
                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
                        <i className="fa-solid fa-rotate text-emerald-600 text-lg mt-0.5"></i>
                        <div className="text-xs text-emerald-950 space-y-1">
                          <p className="font-bold">{t('نظام الإصدارات والتحديث التلقائي السحابي (Database Versioning)')}</p>
                          <p className="text-emerald-800 leading-relaxed">
                            {t('يتم حفظ رقم الإصدار في قاعدة بيانات MySQL، ويقوم متصفح كل طالب ومستخدم بالتحقق تلقائياً من الإصدار كل 30 ثانية والتحديث فوراً بدون الحاجة لمسح الذاكرة أو التحديث اليدوي.')}
                          </p>
                        </div>
                      </div>

                      {/* Status Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                          <p className="text-xs text-slate-500 font-bold mb-1">{t('الإصدار الحالي في قاعدة البيانات')}</p>
                          <p className="text-xl font-black text-slate-800 flex items-center gap-2">
                            <span>v{adminDbVersion.version}</span>
                            <span className="text-xs font-mono font-normal text-slate-400">({adminDbVersion.build})</span>
                          </p>
                        </div>
                        <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-200">
                          <p className="text-xs text-indigo-600 font-bold mb-1">{t('الإصدار المشغّل حالياً في متصفحك')}</p>
                          <p className="text-xl font-black text-indigo-700 flex items-center gap-2">
                            <span>v{APP_CLIENT_VERSION}</span>
                            <span className="text-xs font-mono font-normal text-indigo-400">({APP_CLIENT_BUILD})</span>
                          </p>
                        </div>
                        <div className="p-4 bg-purple-50 rounded-2xl border border-purple-200">
                          <p className="text-xs text-purple-600 font-bold mb-1">{t('محرك الصوت الصارم')}</p>
                          <p className="text-xs font-black text-purple-900 mt-1 flex items-center gap-1.5">
                            <i className="fa-solid fa-shield-halved text-purple-600"></i>
                            <span>صوت AI حصراً (الروبوت محظور)</span>
                          </p>
                        </div>
                      </div>

                      {/* Test Voice Button */}
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <p className="font-bold text-slate-800 text-xs">{t('اختبار فوري لصوت الذكاء الاصطناعي (Gemini TTS):')}</p>
                          <p className="text-slate-500 text-[11px]">{t('تأكد من سماع الصوت البشري الفصيح وعدم صدور أي صوت آلي روبوتي.')}</p>
                        </div>
                        <button type="button"
                          onClick={() => speakText('مرحباً بك! هذا صوت الذكاء الاصطناعي المباشر، تم تعطيل الصوت الروبوتي الآلي نهائياً.')}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs"
                        >
                          <i className="fa-solid fa-volume-high"></i>
                          <span>{t('استمع لصوت الذكاء الاصطناعي')}</span>
                        </button>
                      </div>

                      {/* Edit Version Form */}
                      <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4">
                        <h4 className="font-black text-slate-800 text-sm flex items-center gap-2">
                          <i className="fa-solid fa-pen-to-square text-emerald-600"></i>
                          {t('تعديل ونشر إصدار جديد في قاعدة البيانات')}
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                          <div>
                            <label className="block font-bold text-slate-700 mb-1">{t('رقم الإصدار (Version):')}</label>
                            <input
                              type="text"
                              dir="ltr"
                              value={adminVersionForm.version}
                              onChange={(e) => setAdminVersionForm(prev => ({ ...prev, version: e.target.value }))}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                              placeholder="1.2.0"
                            />
                          </div>

                          <div>
                            <label className="block font-bold text-slate-700 mb-1">{t('معرّف البناء (Build / Timestamp):')}</label>
                            <input
                              type="text"
                              dir="ltr"
                              value={adminVersionForm.build}
                              onChange={(e) => setAdminVersionForm(prev => ({ ...prev, build: e.target.value }))}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                              placeholder="20261012-v120"
                            />
                          </div>
                        </div>

                        <div className="pt-2 flex items-center gap-3">
                          <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700">
                            <input
                              type="checkbox"
                              checked={adminVersionForm.forceReload}
                              onChange={(e) => setAdminVersionForm(prev => ({ ...prev, forceReload: e.target.checked }))}
                              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                            <span>{t('فرض التحديث وإعادة التحميل الفوري لجميع أجهزة الطلاب والمتصفحات')}</span>
                          </label>
                        </div>
                      </div>

                      {/* Save Status Message */}
                      {versionSaveMsg && (
                        <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2">
                          <i className="fa-solid fa-check"></i>
                          <span>{versionSaveMsg}</span>
                        </div>
                      )}

                      {/* Submit Button */}
                      <div className="pt-2">
                        <button type="button"
                          onClick={handleSaveVersion}
                          disabled={isSavingVersion}
                          className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 disabled:opacity-50 text-white font-black text-sm rounded-2xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <i className={`fa-solid ${isSavingVersion ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`}></i>
                          <span>{isSavingVersion ? t('جاري الحفظ في MySQL...') : t('حفظ ونشر التحديث لجميع المستخدمين في قاعدة البيانات')}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end items-center shrink-0">
                  <button type="button"
                    onClick={() => setShowAdminDashboard(false)}
                    className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    {t('إغلاق')}
                  </button>
                </div>
              </div>
            </div>);
}
