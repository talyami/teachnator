import { installAudioUnlock, clearNarration, initAudio, unlockAudio, playClick, playFlipTone, playMasteredTone, playStreakTone, playMemoryAnchor, playCorrect, playWrong, playWin, startAmbientMusic, stopAmbientMusic, triggerConfetti, stopAllSpeech, speakText, prefetchVoice, updatePinkNoiseLive, audioRuntime } from './services/audio.js';
import { evaluateShortAnswerWithAi, draftQuizFromMaterial, reviseQuizDraft } from './services/generation.js';
import { getApiUrl, apiHeaders, readApiResponse, materialApi, requestAiCompletion, GUEST_MATERIAL_KEY, activeMaterialContext, setActiveMaterialContext } from './services/api.js';
import { getContentLanguage, normalizeArabicText, normalizeQuestion, clampStudyIndex, queueReviewQuestion, addWrongQuestion, shuffledCopy, prepareQuizQuestions, localEvaluateShortAnswer, getSpokenQuestionText } from './domain/questions.cjs';
import { readUiLanguage, uiText, uiErrorText, translateUi, translateUiError, setUiLanguage as setTranslationLanguage } from './i18n/index.js';
import React, { useState, useEffect, useRef } from 'react';
import mammoth from 'mammoth/mammoth.browser.js';
import { useStudySession } from './services/useStudySession.js';
import { reportClientError } from './services/diagnostics.cjs';
import { revokeThenClear } from './services/auth.cjs';
import { deactivateGuestWorkspace, activateGuestWorkspace, guestWorkspaceActive } from './services/workspace.cjs';
import { withBitmap, installOneTimeUnlock } from './services/resources.cjs';
import { answerTransition, learnTransition, restoreRun } from './domain/study.cjs';
import { remainingMs } from './domain/timer.cjs';
import { normalizeQuestions } from './domain/questions.cjs';
import { UploadView, LearnView, QuizView, ResultView, AdminView, SettingsView } from './views/index.jsx';
window.mammoth = mammoth;
const isFillBlankQuestion = q => q?.type === 'fill_blank';
const isShortAnswerQuestion = q => q?.type === 'short_answer';
const getSpeechLocale = content => { const language = getContentLanguage(content); return language === 'ar' ? 'ar-SA' : language === 'en' ? 'en-US' : language; };

    // Remove obsolete browser-side AI configuration; credentials now stay on the server.
    try {
      ['ai_provider', 'quiz_ai_provider', 'gemini_api_key', 'vertex_config',
       'vertex_project_id', 'vertex_region', 'vertex_key_token', 'gemini_model',
       'gemini_tts_model', 'gemini_tts_voice', 'cached_models', 'cached_tts_models']
        .forEach(key => localStorage.removeItem(key));
    } catch (_) {}

    // ثوابت إصدار الواجهة ومحرك الصوت الحصري
    const { version: APP_CLIENT_VERSION, build: APP_CLIENT_BUILD, hasUpdate, shouldReload, releaseKey } = require('../release.cjs');

    // التطبيق الرئيسي
export default function App() {
      const [showSettings, setShowSettings] = useState(false);
      useEffect(() => installAudioUnlock(), []);
      // حالة التحديث التلقائي وإصدار التطبيق من قاعدة البيانات
      const [updateBanner, setUpdateBanner] = useState(null); // { version, build, message }
      const [checkingVersion, setCheckingVersion] = useState(false);
      const [adminDbVersion, setAdminDbVersion] = useState({ version: APP_CLIENT_VERSION, build: APP_CLIENT_BUILD, forceReload: false });
      const [adminVersionForm, setAdminVersionForm] = useState({ version: APP_CLIENT_VERSION, build: APP_CLIENT_BUILD, forceReload: false });
      const [isSavingVersion, setIsSavingVersion] = useState(false);
      const [versionSaveMsg, setVersionSaveMsg] = useState('');

      const [uiLanguage, setUiLanguage] = useState(readUiLanguage);
      const t = (key, values) => translateUi(key, values, uiLanguage);
      const uiError = (message) => translateUiError(message, uiLanguage);
      const toggleUiLanguage = () => {
        const next = uiLanguage === 'ar' ? 'en' : 'ar';
        setTranslationLanguage(next);
        try { localStorage.setItem('fl_ui_language', next); } catch (_) {}
        setUiLanguage(next);
      };
      useEffect(() => {
        setTranslationLanguage(uiLanguage);
        document.documentElement.lang = uiLanguage;
        document.documentElement.dir = uiLanguage === 'ar' ? 'rtl' : 'ltr';
        document.title = t('المولّد الذكي للاختبارات 🧠✨');
      }, [uiLanguage]);
      const renderLanguageToggle = (inSettings = false) => (
        <button type="button" onClick={toggleUiLanguage}
          title={t('تبديل لغة الواجهة')} aria-label={t('تبديل لغة الواجهة')}
          className={inSettings
            ? 'px-3 py-2 rounded-xl border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-bold text-xs cursor-pointer'
            : 'px-2 py-1 rounded-full border border-white/30 bg-white/15 hover:bg-white/25 text-white font-bold text-xs cursor-pointer shrink-0'}>
          <span lang={uiLanguage === 'ar' ? 'en' : 'ar'} dir="auto">{uiLanguage === 'ar' ? 'E' : 'ع'}</span>
        </button>
      );
      const [mode, setMode] = useState('setup'); // setup | upload | generating | intro | learn | quiz | result
      const [playerName, setPlayerName] = useState('');
      const [questionsData, setQuestionsData] = useState([]);
      const [currentIndex, setCurrentIndex] = useState(0);
      const [showHint, setShowHint] = useState(false);
      const [quizMemoryQuestion, setQuizMemoryQuestion] = useState(null);
      const quizMemoryOpenRef = useRef(false);
      const quizAdvanceTimeoutRef = useRef(null);
      const pendingQuizAdvanceRef = useRef(null);
      const quizInteractionVersionRef = useRef(0);
      const [score, setScore] = useState(0);
      const [shuffledQuestions, setShuffledQuestions] = useState([]);
      const [selectedAnswer, setSelectedAnswer] = useState(null);
      const [isAnswerChecked, setIsAnswerChecked] = useState(false);
      const [errorMsg, setErrorMsg] = useState("");
      const [generationStatus, setGenerationStatus] = useState('drafting'); // drafting | revising
      
      // حالات أسئلة الإجابة القصيرة (Short Answer Questions) ومراجعة الذكاء الاصطناعي
      const [studentShortAnswer, setStudentShortAnswer] = useState('');
      const [isEvaluatingShortAnswer, setIsEvaluatingShortAnswer] = useState(false);
      const [shortAnswerEvaluation, setShortAnswerEvaluation] = useState(null);
      const [isListeningSpeech, setIsListeningSpeech] = useState(false);
      const recognitionRef = useRef(null);
      
      // Timer values are provided by the run-scoped elapsed-time session below.
      const [soundEnabled, setSoundEnabled] = useState(true);
      const [musicEnabled, setMusicEnabled] = useState(true);
      const [binauralMode, setBinauralMode] = useState(() => localStorage.getItem('binaural_mode') || 'gamma'); // 'gamma' (40Hz) | 'alpha' (10Hz)
      const [voiceEnabled, setVoiceEnabled] = useState(() => localStorage.getItem('voice_narrator_enabled') !== 'false');

      // حالات التعلم الإدراكي الفائق والذاكرة غير الواعية (Stealth Cognitive Learning States)
      const [isAnswerRevealed, setIsAnswerRevealed] = useState(false); // Active Recall (Blind Peek)
      const [showWhy, setShowWhy] = useState(false); // Elaborative Interrogation (Feynman / سر الفكرة)
      const [consecutiveStreak, setConsecutiveStreak] = useState(0); // Dopamine Streak Multiplier
      const [fillBlankSelected, setFillBlankSelected] = useState(null); // Generation Effect (Cloze Deletion)
      
      // حالة النطق والتحميل الصوتي (idle | loading | speaking) لتحديث أيقونات السماعة
      const [speechState, setSpeechState] = useState({ status: 'idle', text: null });
      const [pinkNoiseEnabled, setPinkNoiseEnabled] = useState(() => localStorage.getItem('pink_noise_enabled') !== 'false');
      const [pinkNoiseVolume, setPinkNoiseVolume] = useState(() => parseFloat(localStorage.getItem('pink_noise_volume') || '0.08'));

      useEffect(() => {
        window.__onSpeechStateChange = (state) => {
          setSpeechState(state || { status: 'idle', text: null });
        };
        return () => { window.__onSpeechStateChange = null; };
      }, []);
      // إعلانات الأخطاء والإنجازات (Study Created & QA Finished) كملصقات وتنبيهات مرئية وصوتية
      const [confirmation, setConfirmation] = useState(null);
      const confirmationResolver = useRef(null);
      const notify = (message) => setErrorAnnouncement({ type: t('تنبيه'), message });
      const requestConfirmation = (message) => new Promise(resolve => {
        lastFocusedElementRef.current = document.activeElement;
        confirmationResolver.current = resolve;
        setConfirmation(message);
      });
      const resolveConfirmation = (accepted = false) => {
        confirmationResolver.current?.(accepted);
        confirmationResolver.current = null;
        setConfirmation(null);
      };
      const [errorAnnouncement, setErrorAnnouncement] = useState(null); // { type, message, timestamp }
      const [appAnnouncement, setAppAnnouncement] = useState(null); // { type, title, message, speechText, icon, badge, timestamp }
      // ==========================================
      // حالات الحساب والمصادقة ولوحات التحكم (Google/Apple Auth & Dashboards)
      // ==========================================
      const [currentUser, setCurrentUser] = useState(null);
      const [authToken, setAuthToken] = useState(() => localStorage.getItem('auth_token') || '');
      const [showAuthModal, setShowAuthModal] = useState(false);
      const [legalPage, setLegalPage] = useState(null);
      const [billingInfo, setBillingInfo] = useState(null);
      const [publicConfig, setPublicConfig] = useState(null);
      const legalHref = page => getApiUrl('/api/' + page).replace(/\/api\//, '/');
      useEffect(() => { let active = true; fetch(getApiUrl('/api/config'), { cache: 'no-store' }).then(r => r.json()).then(data => { if (active) setPublicConfig(data); }).catch(() => {}); return () => { active = false; }; }, []);
      const supportEmail = typeof publicConfig?.supportEmail === 'string' && /^(?=.{3,254}$)(?!.*\.\.)(?!\.)[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}(?<!\.)@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(publicConfig.supportEmail.trim())
        ? publicConfig.supportEmail.trim() : '';
      const configuredPacks = Array.isArray(billingInfo?.packs) ? billingInfo.packs.filter(pack => pack && typeof pack.id === 'string' && Number.isSafeInteger(pack.materials) && pack.materials > 0 && Number.isSafeInteger(pack.amountHalalas) && pack.amountHalalas > 0 && pack.currency === 'SAR') : [];
      const legalTitles = uiLanguage === 'ar'
        ? { privacy: 'الخصوصية', terms: 'شروط الاستخدام', refund: 'الاسترجاع', contact: 'التواصل والدعم', billing: 'حالة الدفع والتوفر' }
        : { privacy: 'Privacy', terms: 'Terms of use', refund: 'Refunds', contact: 'Contact & support', billing: 'Billing & availability' };
      const openLegalPage = page => {
        // Keep the original trigger when opening this over another dialog.
        if (!document.activeElement?.closest('[data-study-dialog]')) lastFocusedElementRef.current = document.activeElement;
        setLegalPage(page);
      };
      useEffect(() => {
        let active = true;
        fetch(getApiUrl('/api/billing/packs'), { cache: 'no-store' }).then(r => r.json()).then(data => { if (active && data.success) setBillingInfo(data); }).catch(() => {});
        return () => { active = false; };
      }, []);
      const googleSignInRef = useRef(null);
      const [googleAuthState, setGoogleAuthState] = useState('loading');
      const [googleAuthError, setGoogleAuthError] = useState('');
      const [googleAuthAttempt, setGoogleAuthAttempt] = useState(0);
      const [isSigningIn, setIsSigningIn] = useState(false);
      const [showUserDashboard, setShowUserDashboard] = useState(false);
      const [showAdminDashboard, setShowAdminDashboard] = useState(false);
      const [userMaterials, setUserMaterials] = useState([]);
      const [isLoadingMaterials, setIsLoadingMaterials] = useState(false);
      const [currentMaterialId, setCurrentMaterialId] = useState(null);
      const [completedGenerationId, setCompletedGenerationId] = useState(null);
      const [materialQuota, setMaterialQuota] = useState(null);
      const [quotaLoading, setQuotaLoading] = useState(true);
      const [quotaError, setQuotaError] = useState('');
      const [sessionOwner, setSessionOwner] = useState(null);
      const [guestSavedMaterial, setGuestSavedMaterial] = useState(null);
      const [adminQuotaEdits, setAdminQuotaEdits] = useState({});
      const [savingQuotaUser, setSavingQuotaUser] = useState(null);
      const identityRef = useRef(authToken);
      const logoutInFlight = useRef(false);
      const authEpoch = useRef(0);
      const generationRef = useRef(null);
      const materialSelectionRef = useRef(0);
      // The token remains only an authorization credential, never a storage owner key.
      const ownerKey = (() => {
        if (!authToken) return 'guest';
        try {
          const payload = JSON.parse(atob(authToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          return `account:${payload.id || payload.sub || 'unknown'}`;
        } catch (_) { return 'account:unknown'; }
      })();
      const canGenerateMaterial = !!authToken && sessionOwner === ownerKey && !quotaLoading && !quotaError && !!materialQuota &&
        materialQuota.canGenerate === true;
      const isAllowanceExhausted = !!authToken && sessionOwner === ownerKey && !quotaLoading && !quotaError && !!materialQuota &&
        materialQuota.materialLimit !== null &&
        (materialQuota.remaining <= 0 || materialQuota.canGenerate === false);
      const refreshMaterialQuota = async (token = authToken) => {
        setQuotaLoading(true);
        setQuotaError('');
        try {
          const data = await materialApi('/api/material-quota', { token });
          if (identityRef.current !== token) return null;
          const quota = data.quota || data;
          setMaterialQuota(quota);
          return quota;
        } catch (e) {
          if (identityRef.current === token) { setMaterialQuota(null); setQuotaError(e.message); }
          throw e;
        } finally {
          if (identityRef.current === token) setQuotaLoading(false);
        }
      };

      // إحصائيات وقائمة مستخدمي لوحة المشرف وإعدادات الذكاء الاصطناعي
      const [adminTab, setAdminTab] = useState('users'); // 'users' | 'ai_settings'
      const [adminUsers, setAdminUsers] = useState([]);
      const [adminStats, setAdminStats] = useState(null);
      const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);
      const [adminSearch, setAdminSearch] = useState('');
      const [adminAiSettings, setAdminAiSettings] = useState({
        server_brain_url: '',
        server_brain_api_key: '',
        server_brain_model: '',
        server_tts_provider: 'gemini',
        server_gemini_api_key: '',
        server_tts_model: 'gemini-2.5-flash-preview-tts',
        server_tts_voice: 'Aoede',
        server_vertex_config: { project: '', region: 'global', key: '' }
      });
      const [isLoadingAiSettings, setIsLoadingAiSettings] = useState(false);
      const [isSavingAiSettings, setIsSavingAiSettings] = useState(false);
      const [aiSettingsSaveMsg, setAiSettingsSaveMsg] = useState('');
      const [testingAi, setTestingAi] = useState(null); // 'brain' | 'tts' | null
      const [aiTestResult, setAiTestResult] = useState(null); // { type, success, message, latency }
      const [showBrainKey, setShowBrainKey] = useState(false);
      const [showGeminiKey, setShowGeminiKey] = useState(false);
      const [showVertexKey, setShowVertexKey] = useState(false);
      // فحص الجلسة الحالية عند تحميل الصفحة
      const checkAuthSession = async (tokenToCheck) => {
        const t = tokenToCheck || authToken;
        if (!t) return;
        try {
          const res = await fetch(getApiUrl('/api/auth/me'), {
            headers: { 'Authorization': `Bearer ${t}` }
          });
          const data = await res.json();
          if (identityRef.current !== t) return;
          if (data.authenticated && data.user) {
            setCurrentUser(data.user);
            localStorage.setItem('user_has_server_ai', data.user.has_server_ai_access === 1 ? 'true' : 'false');
            if (data.user.name && !playerName) {
              setPlayerName(data.user.name);
            }
          } else {
            identityRef.current = '';
            generationRef.current?.controller.abort();
            setActiveMaterialContext({});
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_has_server_ai');
            setAuthToken('');
            setCurrentUser(null);
          }
        } catch (e) {
          console.warn('Session check warning:', e.message);
        }
      };

      useEffect(() => {
        if (authToken) checkAuthSession(authToken);
      }, [authToken]);
      useEffect(() => {
        const syncAccount = event => {
          if (event.key !== 'auth_token' && event.key !== null) return;
          const token = localStorage.getItem('auth_token') || '';
          authEpoch.current += 1;
          setIsSigningIn(false);
          identityRef.current = token;
          generationRef.current?.controller.abort();
          setActiveMaterialContext({});
          setCurrentUser(null);
          setAuthToken(token);
        };
        window.addEventListener('storage', syncAccount);
        return () => window.removeEventListener('storage', syncAccount);
      }, []);

      useEffect(() => {
        let cancelled = false;
        let loadTimer;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        setGoogleAuthState('loading');
        setGoogleAuthError('');

        // Initialize only after both config and the asynchronous Google SDK are ready.
        fetch(getApiUrl('/api/config'), { signal: controller.signal })
          .then(r => {
            if (!r.ok) throw new Error(t('تعذر تحميل إعدادات تسجيل الدخول.'));
            return r.json();
          })
          .then(cfg => {
            if (cancelled) return;
            if (!cfg.googleClientId) throw new Error(t('تسجيل الدخول عبر Google غير مهيأ في الخادم.'));
            const deadline = Date.now() + 12000;
            const initializeGoogle = () => {
              if (cancelled) return;
              if (!window.google?.accounts?.id) {
                if (Date.now() >= deadline) {
                  setGoogleAuthState('error');
                  setGoogleAuthError(t('تعذر تحميل Google. تحقق من الشبكة أو مانع الإعلانات ثم أعد المحاولة.'));
                  return;
                }
                loadTimer = setTimeout(initializeGoogle, 100);
                return;
              }
              try {
              window.google.accounts.id.initialize({
                client_id: cfg.googleClientId,
                callback: async (response) => {
                  if (cancelled) return;
                  if (response.credential) {
                    if (logoutInFlight.current) return;
                    const signInEpoch = ++authEpoch.current;
                    setIsSigningIn(true);
                    setGoogleAuthError('');
                    try {
                      const res = await fetch(getApiUrl('/api/auth/google'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ idToken: response.credential })
                      });
                      const data = await res.json();
                      if (cancelled || signInEpoch !== authEpoch.current || logoutInFlight.current) return;
                      if (!res.ok || !data.success) throw new Error(data.message || t('فشل تسجيل الدخول بحساب Google'));
                      if (data.success) {
                        identityRef.current = data.token;
                        generationRef.current?.controller.abort();
                        setActiveMaterialContext({});
                        setAuthToken(data.token);
                        localStorage.setItem('auth_token', data.token);
                        localStorage.setItem('user_has_server_ai', data.user.has_server_ai_access === 1 ? 'true' : 'false');
                        setCurrentUser(data.user);
                        if (data.user.name) setPlayerName(data.user.name);
                        setShowAuthModal(false);
                      }
                    } catch (e) {
                      if (!cancelled && signInEpoch === authEpoch.current && !logoutInFlight.current) setGoogleAuthError(translateUiError(e.message));
                    } finally {
                      if (!cancelled && signInEpoch === authEpoch.current) setIsSigningIn(false);
                    }
                  }
                }
              });
              setGoogleAuthState('ready');
              } catch (e) {
                setGoogleAuthState('error');
                setGoogleAuthError(translateUiError(e.message));
              }
            };
            initializeGoogle();
          })
          .catch(e => {
            if (!cancelled) {
              setGoogleAuthState('error');
              setGoogleAuthError(e.name === 'AbortError' ? t('تعذر تحميل إعدادات تسجيل الدخول.') : translateUiError(e.message));
            }
          })
          .finally(() => clearTimeout(timeout));
        return () => {
          cancelled = true;
          clearTimeout(timeout);
          clearTimeout(loadTimer);
          controller.abort();
        };
      }, [googleAuthAttempt]);

      useEffect(() => {
        if (!showAuthModal || googleAuthState !== 'ready' || !googleSignInRef.current) return;
        try {
          // An explicit Google button opens account selection; One Tap prompt() can silently decline.
          window.google.accounts.id.renderButton(googleSignInRef.current, {
            type: 'standard', theme: 'outline', size: 'large', text: 'signin_with',
            shape: 'rectangular', width: Math.min(320, googleSignInRef.current.clientWidth || 320),
            locale: uiLanguage === 'ar' ? 'ar' : 'en'
          });
        } catch (e) {
          setGoogleAuthState('error');
          setGoogleAuthError(translateUiError(e.message));
        }
      }, [showAuthModal, googleAuthState, uiLanguage]);

      // تسجيل الخروج
      const handleLogout = async () => {
        if (logoutInFlight.current || !authToken) return;
        logoutInFlight.current = true; authEpoch.current += 1;
        const token = authToken;
        try {
          await revokeThenClear({ token, revoke: captured => materialApi('/api/auth/logout', { token: captured, method: 'POST', body: {} }),
            isCurrent: captured => identityRef.current === captured && localStorage.getItem('auth_token') === captured,
            clear: () => {
              identityRef.current = ''; generationRef.current?.controller.abort(); setActiveMaterialContext({}); study.clear(); clearNarration();
              sessionStorage.removeItem('smartExamAccountSession'); localStorage.removeItem('auth_token'); localStorage.removeItem('user_has_server_ai');
              setAuthToken(''); setCurrentUser(null); setShowUserDashboard(false); setShowAdminDashboard(false);
            }
          });
        } catch (_) { notify(t('تعذر تسجيل الخروج. حاول مرة أخرى.')); }
        finally { logoutInFlight.current = false; }
      };

      // جلب مواد المستخدم المحفوظة في قاعدة البيانات
      const fetchUserMaterials = async () => {
        if (!authToken) return;
        setIsLoadingMaterials(true);
        try {
          const res = await fetch(getApiUrl('/api/materials'), {
            headers: { 'Authorization': `Bearer ${authToken}` }
          });
          const data = await res.json();
          if (data.success && identityRef.current === authToken) {
            setUserMaterials(data.materials || []);
          }
        } catch (e) {
          console.error('Fetch materials error:', e);
        } finally {
          setIsLoadingMaterials(false);
        }
      };

      // Server charges once on successful draft; completion atomically confirms saving. Always await it.
      const saveMaterialToDb = async (title, questions, generationId, token, signal) => {
        const data = await materialApi(`/api/material-generations/${encodeURIComponent(generationId)}/complete`, {
          token, method: 'POST', signal,
          body: { title: title.slice(0, 255), questions, totalQuestions: questions.length }
        });
        if (identityRef.current !== token) throw new Error('Account changed.');
        if (token && !data.materialId) throw new Error('The server did not confirm saving this material.');
        setCurrentMaterialId(token ? data.materialId : null);
        setCompletedGenerationId(generationId);
        setActiveMaterialContext(token ? { materialId: data.materialId } : { generationId });
        if (data.quota) setMaterialQuota(data.quota);
        if (token) await fetchUserMaterials();
        return data;
      };

      // Compatibility for navigation controls: update an explicit immutable run snapshot.
      const saveProgressToDb = (qIndex, currentScore, isCompleted, progressMode, progressQuestions, overrides = {}) => {
        const run = study.runRef.current;
        if (!run || run.mode !== progressMode || run.owner !== ownerKey) return;
        study.hold({ ...run, queue: progressQuestions, currentIndex: qIndex, score: currentScore, completed: !!isCompleted,
          wrongQuestions: overrides.wrongQuestions ?? run.wrongQuestions, consecutiveStreak: overrides.consecutiveStreak ?? run.consecutiveStreak });
      };

      // جلب بيانات وأسئلة المادة من الخادم
      const fetchMaterialData = async (matId) => {
        const res = await fetch(getApiUrl(`/api/materials/${matId}`), {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success && data.material) {
          const rawQuestions = Array.isArray(data.material.questions) ? data.material.questions : [];
          const sanitized = normalizeQuestions(rawQuestions);
          if (sanitized.length === 0) {
            notify(translateUi('المادة المحددة لا تحتوي على أسئلة صالحة'));
            return null;
          }
          return { material: data.material, sanitized };
        }
        throw new Error(data.message || 'Failed to load material');
      };

      // بدء أو استئناف الاختبار للمادة من القائمة المحفوظة
      const handleResumeQuiz = async (mat) => {
        if (!mat || !mat.id) return;
        const selection = ++materialSelectionRef.current;
        study.invalidateSelection();
        try {
          const result = await fetchMaterialData(mat.id);
          if (!result || selection !== materialSelectionRef.current || identityRef.current !== authToken) return;
          const { sanitized } = result;

          const restoredRun = await study.resume('quiz', sanitized, mat.id);
          if (!restoredRun || selection !== materialSelectionRef.current || identityRef.current !== authToken) return;
          clearNarration();
          setCurrentMaterialId(mat.id); setCompletedGenerationId(null); setActiveMaterialContext({ materialId: mat.id });
          setQuestionsData(sanitized); setAllOriginalQuestions(sanitized); setShowUserDashboard(false);
          speak(restoredRun.queue[restoredRun.currentIndex]);
          return;
        } catch (e) {
          notify(translateUi('تعذر استئناف الاختبار:') + ' ' + translateUiError(e.message));
        }
      };

      // بدء أو استئناف مذاكرة المادة
      const handleStartStudyMaterial = async (mat) => {
        if (!mat || !mat.id) return;
        const selection = ++materialSelectionRef.current;
        study.invalidateSelection();
        try {
          const result = await fetchMaterialData(mat.id);
          if (!result || selection !== materialSelectionRef.current || identityRef.current !== authToken) return;
          const { sanitized } = result;

          const restoredRun = await study.resume('learn', sanitized, mat.id);
          if (!restoredRun || selection !== materialSelectionRef.current || identityRef.current !== authToken) return;
          clearNarration();
          setCurrentMaterialId(mat.id); setCompletedGenerationId(null); setActiveMaterialContext({ materialId: mat.id });
          setAllOriginalQuestions(sanitized); setShuffledQuestions([]); setShowUserDashboard(false);
          speak(restoredRun.queue[restoredRun.currentIndex]);
          return;
        } catch (e) {
          notify(translateUi('تعذر بدء مذاكرة المادة:') + ' ' + translateUiError(e.message));
        }
      };

      const handleResumeMaterial = handleResumeQuiz;

      // حذف مادة محفوظة
      const handleDeleteMaterial = async (matId) => {
        if (!await requestConfirmation(t('هل أنت متأكد من حذف هذه المادة وتقدمها بالكامل؟'))) return;
        try {
          const res = await fetch(getApiUrl(`/api/materials/${matId}`), {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
          });
          const d = await res.json();
          if (d.success) {
            setUserMaterials(prev => prev.filter(m => m.id !== matId));
            if (currentMaterialId === matId) setCurrentMaterialId(null);
          }
        } catch (e) {
          notify(translateUi('فشل الحذف:') + ' ' + translateUiError(e.message));
        }
      };

      // جلب إعدادات ومفاتيح الذكاء الاصطناعي للمشرف
      const fetchAdminAiSettings = async () => {
        if (!authToken || currentUser?.role !== 'admin') return;
        setIsLoadingAiSettings(true);
        try {
          const res = await fetch(getApiUrl('/api/admin/ai-settings'), {
            headers: { 'Authorization': `Bearer ${authToken}` }
          });
          const d = await res.json();
          if (d.success && d.settings) {
            let vertexConf = { project: '', region: 'global', key: '' };
            try {
              if (d.settings.server_vertex_config) {
                vertexConf = typeof d.settings.server_vertex_config === 'string'
                  ? JSON.parse(d.settings.server_vertex_config)
                  : d.settings.server_vertex_config;
              }
            } catch (_) {}
            setAdminAiSettings({
              server_brain_url: d.settings.server_brain_url || '',
              server_brain_api_key: d.settings.server_brain_api_key || '',
              server_brain_model: d.settings.server_brain_model || '',
              server_tts_provider: d.settings.server_tts_provider || 'gemini',
              server_gemini_api_key: d.settings.server_gemini_api_key || '',
              server_tts_model: d.settings.server_tts_model || 'gemini-2.5-flash-preview-tts',
              server_tts_voice: d.settings.server_tts_voice || 'Aoede',
              server_vertex_config: vertexConf || { project: '', region: 'global', key: '' }
            });
          }
        } catch (e) {
          console.error('Fetch AI settings error:', e);
        } finally {
          setIsLoadingAiSettings(false);
        }
      };

      // حفظ إعدادات الذكاء الاصطناعي في قاعدة البيانات
      const handleSaveAiSettings = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!authToken || currentUser?.role !== 'admin') return;
        setIsSavingAiSettings(true);
        setAiSettingsSaveMsg('');
        try {
          const res = await fetch(getApiUrl('/api/admin/ai-settings'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
              settings: {
                ...adminAiSettings,
                server_vertex_config: JSON.stringify(adminAiSettings.server_vertex_config || {})
              }
            })
          });
          const d = await res.json();
          if (d.success) {
            setAiSettingsSaveMsg(d.message || t('تم حفظ وتحديث إعدادات الذكاء الاصطناعي بنجاح في قاعدة البيانات ✅'));
            setTimeout(() => setAiSettingsSaveMsg(''), 5000);
          } else {
            notify(translateUi('فشل الحفظ:') + ' ' + (d.message || ''));
          }
        } catch (e) {
          notify(translateUi('فشل الحفظ:') + ' ' + translateUiError(e.message));
        } finally {
          setIsSavingAiSettings(false);
        }
      };

      // فحص اتصال الذكاء الاصطناعي الفوري
      const handleTestAiConnection = async (type) => {
        if (!authToken || currentUser?.role !== 'admin') return;
        setTestingAi(type);
        setAiTestResult(null);
        try {
          const res = await fetch(getApiUrl('/api/admin/ai-test'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ type })
          });
          const d = await readApiResponse(res);
          setAiTestResult({
            type,
            success: d.success,
            latency: d.latency,
            message: d.success 
              ? (type === 'brain' 
                  ? t('متصل بالمخ بنجاح ({latency}ms) 🧠 رد النموذج: {resp}', { latency: d.latency, resp: d.response || 'OK' })
                  : t('متصل بخدمة الصوت بنجاح ({latency}ms) 🎙️', { latency: d.latency }))
              : (d.message || t('فشل الاتصال'))
          });
        } catch (e) {
          setAiTestResult({
            type,
            success: false,
            message: translateUiError(e.message)
          });
        } finally {
          setTestingAi(null);
        }
      };

      const lastVersionCheckRef = useRef(0);
      const dismissedUpdateRef = useRef(null);
      // فحص إصدار التطبيق والمقارنة مع قاعدة البيانات مع دعم التحديث التلقائي (عند التركيز، إعادة الاتصال، والتنقل بين الصفحات)
      const checkAppVersion = async (isManual = false) => {
        const now = Date.now();
        if (!isManual && now - lastVersionCheckRef.current < 5000) return;
        lastVersionCheckRef.current = now;

        try {
          if (isManual) setCheckingVersion(true);
          const res = await fetch(getApiUrl(`/api/version?t=${now}`), { cache: 'no-store' });
          if (!res.ok) return;
          const data = await res.json();
          if (!data || !data.version) return;

          setAdminDbVersion({
            version: data.version,
            build: data.build || '',
            forceReload: Boolean(data.forceReload)
          });

          const isNewVersion = hasUpdate(data);
          if (!isNewVersion) setUpdateBanner(null);
          if (isNewVersion) {
            if (shouldReload(data, window.sessionStorage)) {
              setUpdateBanner({
                version: data.version,
                build: data.build,
                message: t('🔄 تم إطلاق تحديث فوري جديد ({version})... جاري تحديث التطبيق الآن...', { version: data.version })
              });
              setTimeout(() => {
                window.location.href = window.location.pathname + '?v=' + Date.now();
              }, 1200);
              return;
            }
            if (isManual || dismissedUpdateRef.current !== releaseKey(data)) setUpdateBanner({
              version: data.version,
              build: data.build,
              message: t('🚀 يتوفر تحديث جديد للتطبيق ({version})! اضغط لتحديث فوري.', { version: data.version })
            });
            if (isManual) {
              setAppAnnouncement({
                type: 'update',
                title: t('تحديث جديد متوفر'),
                message: t('يتوفر إصدار أحدث ({version})! اضغط على زر التحديث بالأعلى.', { version: data.version }),
                badge: 'Update',
                icon: 'fa-cloud-arrow-down'
              });
            }
          } else if (isManual) {
            setAppAnnouncement({
              type: 'system',
              title: t('التطبيق محدث'),
              message: t('أنت تستخدم أحدث إصدار بالفعل (v{version}) • محرك صوت الذكاء الاصطناعي حصراً نشط ✅', { version: APP_CLIENT_VERSION }),
              badge: 'v' + APP_CLIENT_VERSION,
              icon: 'fa-circle-check'
            });
          }
        } catch (e) {
          if (isManual) {
            setAppAnnouncement({
              type: 'error',
              title: t('تعذر فحص التحديثات'),
              message: t('تعذر الاتصال بخادم التحديثات حالياً. تحقق من اتصالك.'),
              icon: 'fa-triangle-exclamation'
            });
          }
        } finally {
          if (isManual) setCheckingVersion(false);
        }
      };

      // فحص التحديثات عند فتح التطبيق، التركيز على النافذة/التبويب، وعند عودة الاتصال (بدون مؤقت زمني مستمر)
      useEffect(() => {
        checkAppVersion();
        const handleFocus = () => checkAppVersion();
        const handleVisibility = () => { if (!document.hidden) checkAppVersion(); };
        const handleOnline = () => checkAppVersion();

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('online', handleOnline);

        return () => {
          window.removeEventListener('focus', handleFocus);
          document.removeEventListener('visibilitychange', handleVisibility);
          window.removeEventListener('online', handleOnline);
        };
      }, []);

      // فحص الإصدار تلقائياً عند التركيز والتنقل بين صفحات الواجهة ومحتوياتها
      useEffect(() => {
        checkAppVersion();
      }, [mode, showAdminDashboard, showUserDashboard, showSettings]);

      const fetchAdminVersion = async () => {
        try {
          const res = await fetch(getApiUrl(`/api/version?t=${Date.now()}`), { cache: 'no-store' });
          if (!res.ok) return;
          const data = await res.json();
          if (data && data.version) {
            setAdminDbVersion({ version: data.version, build: data.build || '', forceReload: Boolean(data.forceReload) });
            setAdminVersionForm({ version: data.version, build: data.build || '', forceReload: Boolean(data.forceReload) });
          }
        } catch (e) {
          console.warn('Failed to fetch admin version:', e);
        }
      };

      const handleSaveVersion = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!authToken || currentUser?.role !== 'admin') return;
        setIsSavingVersion(true);
        setVersionSaveMsg('');
        try {
          const res = await fetch(getApiUrl('/api/admin/version'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(adminVersionForm)
          });
          const d = await res.json();
          if (d.success) {
            setAdminDbVersion({ version: d.version, build: d.build, forceReload: d.forceReload });
            setVersionSaveMsg(t('تم تحديث وحفظ الإصدار في قاعدة البيانات بنجاح ✅'));
            setTimeout(() => setVersionSaveMsg(''), 5000);
            if (!hasUpdate(d)) setUpdateBanner(null);
            if (hasUpdate(d)) {
              setUpdateBanner({
                version: d.version,
                build: d.build,
                message: t('تم نشر الإصدار ({version}) في قاعدة البيانات بنجاح!', { version: d.version })
              });
            }
          } else {
            notify(translateUi('فشل الحفظ:') + ' ' + (d.message || ''));
          }
        } catch (e) {
          notify(translateUi('فشل الحفظ:') + ' ' + translateUiError(e.message));
        } finally {
          setIsSavingVersion(false);
        }
      };

      // جلب بيانات لوحة تحكم المشرف (Admin Dashboard)
      const fetchAdminData = async () => {
        if (!authToken || currentUser?.role !== 'admin') return;
        setIsLoadingAdmin(true);
        try {
          const [statsRes, usersRes] = await Promise.all([
            fetch(getApiUrl('/api/admin/stats'), { headers: { 'Authorization': `Bearer ${authToken}` } }).then(r => r.json()),
            fetch(getApiUrl(`/api/admin/users${adminSearch ? `?search=${encodeURIComponent(adminSearch)}` : ''}`), { headers: { 'Authorization': `Bearer ${authToken}` } }).then(r => r.json()),
            fetchAdminAiSettings(),
            fetchAdminVersion()
          ]);

          if (identityRef.current !== authToken) return;
          if (statsRes && statsRes.success) setAdminStats(statsRes.stats);
          if (usersRes && usersRes.success) setAdminUsers(usersRes.users);
        } catch (e) {
          console.error('Fetch admin data error:', e);
        } finally {
          setIsLoadingAdmin(false);
        }
      };

      // Admin sets TOTAL lifetime allowance, not remaining credits or a binary AI permission.
      const handleSaveUserQuota = async (user) => {
        const value = adminQuotaEdits[user.id] ?? (user.material_limit === null ? 'unlimited' : String(user.material_limit ?? 1));
        const limit = value === 'unlimited' ? null : Number(value);
        if (value !== 'unlimited' && (!/^\d+$/.test(value) || !Number.isSafeInteger(limit) || limit < 0 || limit > 4294967295)) {
          notify(t('أدخل حداً إجمالياً صحيحاً غير سالب أو اختر بلا حد.'));
          return;
        }
        setSavingQuotaUser(user.id);
        try {
          const data = await materialApi(`/api/admin/users/${user.id}/material-quota`, { token: authToken, method: 'POST', body: { materialLimit: limit } });
          setAdminUsers(prev => prev.map(u => u.id === user.id ? { ...u, material_limit: data.quota.materialLimit, materials_used: data.quota.materialsUsed } : u));
          if (user.id === currentUser?.id) await refreshMaterialQuota();
        } catch (e) { notify(`${t('فشل تعديل الصلاحية:')} ${e.message}`); }
        finally { setSavingQuotaUser(null); }
      };



      // دالة مريحة وشاملة لتشغيل الصوت الفصيح بكافة إعدادات Vertex AI و AI Studio مع حماية أسئلة الفراغ
      const speak = (input, force = false, language = getContentLanguage(input)) => {
        let text = input;
        if (input && typeof input === 'object') {
          text = getSpokenQuestionText(input) || input.text || input.clozeText || input.expectedAnswer || input.hint || '';
        }
        text = typeof text === 'string' ? text.trim() : String(text || '').trim();
        if (!text) return;
        if (!force && !voiceEnabled) return;
        setSpeechState({ status: 'loading', text });
        return speakText(text, force ? true : voiceEnabled, language);
      };

      // عنصر واجهة موحد لأيقونات السماعة يعكس الحالات الثلاث (Loading/Pulsing, Speaking/Grey, Idle/Active)
      const renderSpeakerButton = (input, extraClasses = "") => {
        let textToSpeak = input;
        if (input && typeof input === 'object') {
          textToSpeak = getSpokenQuestionText(input) || input.text || input.clozeText || input.expectedAnswer || input.hint || '';
        }
        textToSpeak = typeof textToSpeak === 'string' ? textToSpeak.trim() : String(textToSpeak || '').trim();
        const isThisLoading = speechState.status === 'loading' && (!textToSpeak || speechState.text === textToSpeak);
        const isThisSpeaking = speechState.status === 'speaking' && (!textToSpeak || speechState.text === textToSpeak);

        if (isThisLoading) {
          return (
            <button type="button" 
              disabled
              className={`p-2 rounded-xl text-amber-500 bg-amber-50 border border-amber-200/80 flex-shrink-0 cursor-wait animate-pulse ${extraClasses}`}
              aria-label={t('جاري تجهيز وتحميل النطق بالصوت الفصيح...')} title={t('جاري تجهيز وتحميل النطق بالصوت الفصيح...')}
            >
              <i className="fa-solid fa-spinner fa-spin text-sm"></i>
            </button>
          );
        }

        if (isThisSpeaking) {
          return (
            <button type="button" 
              onClick={() => stopAllSpeech()} 
              className={`p-2 rounded-xl text-slate-400 bg-slate-100 flex-shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition shadow-xs ${extraClasses}`}
              aria-label={t('الصوت ينطق الآن (انقر للإيقاف الفوري)')} title={t('الصوت ينطق الآن (انقر للإيقاف الفوري)')}
            >
              <i className="fa-solid fa-volume-high text-sm text-slate-400"></i>
            </button>
          );
        }

        return (
          <button type="button" 
            onClick={() => speak(textToSpeak, true, getContentLanguage(typeof input === 'object' ? input : (mode === 'quiz' ? shuffledQuestions[currentIndex] : questionsData[currentIndex]) || input))} 
            className={`p-2 rounded-xl text-indigo-600 hover:bg-indigo-100/60 transition flex-shrink-0 cursor-pointer ${extraClasses}`}
            aria-label={t('استمع للنطق بصوت المساعد الصوتي')} title={t('استمع للنطق بصوت المساعد الصوتي')}
          >
            <i className="fa-solid fa-volume-high text-sm"></i>
          </button>
        );
      };

      // دالة التحميل المسبق الفوري لصوت السؤال التالي لضمان التصفير الكامل لأي تأخير
      const prefetch = (input) => {
        let text = input;
        if (input && typeof input === 'object') {
          text = getSpokenQuestionText(input) || input.text || input.clozeText || input.expectedAnswer || input.hint || '';
        }
        text = typeof text === 'string' ? text.trim() : String(text || '').trim();
        if (!text || !voiceEnabled) return;
        prefetchVoice(text, voiceEnabled, getContentLanguage(input));
      };

      // صياغة إعلان النتيجة النهائية بلهجة سعودية بيضاء محببة ومحفزة (Saudi Narrator Style)
      const getFinishSpeechText = (name, finalScore, total, pct) => {
        const language = getContentLanguage(shuffledQuestions[0] || questionsData[0]);
        if (!language.startsWith('ar')) {
          return `Well done${name ? `, ${name}` : ''}! You scored ${finalScore} out of ${total}. ${pct >= 85 ? 'Excellent work!' : pct >= 50 ? 'Keep going — you are making progress!' : 'Review the lesson and try again. You can do it!'}`;
        }
        const student = name || 'يا بطل';
        if (pct >= 85) {
          return `كفو والله يا ${student}! جبت ${finalScore} من ${total}! ما شاء الله تبارك الله عليك، إنجاز أسطوري وعلامة كاملة ترفع الرأس!`;
        } else if (pct >= 50) {
          return `كفو يا ${student}! أبدعت بنتيجة ${finalScore} من ${total}، خطوة بطل حقيقية نحو الإتقان!`;
        } else {
          return `يعطيك العافية يا ${student}! جبت ${finalScore} من ${total}. المراجعة تصنع الأبطال، وبيمديك تبدع أكثر!`;
        }
      };


      const lastFocusedElementRef = useRef(null);
      const cancelQuizInteraction = () => {
        quizInteractionVersionRef.current += 1;
        clearTimeout(quizAdvanceTimeoutRef.current);
        quizAdvanceTimeoutRef.current = null;
        pendingQuizAdvanceRef.current = null;
        setIsEvaluatingShortAnswer(false);
      };
      const interactionPausedRef = useRef(false);
      const scheduleQuizAdvance = (advance, delay) => {
        clearTimeout(quizAdvanceTimeoutRef.current);
        const version = quizInteractionVersionRef.current;
        pendingQuizAdvanceRef.current = () => {
          pendingQuizAdvanceRef.current = null;
          if (version === quizInteractionVersionRef.current) advance();
        };
        quizAdvanceTimeoutRef.current = setTimeout(() => {
          quizAdvanceTimeoutRef.current = null;
          if (!quizMemoryOpenRef.current && !interactionPausedRef.current) pendingQuizAdvanceRef.current?.();
        }, delay);
      };
      const closeQuizMemory = () => {
        quizMemoryOpenRef.current = false;
        setQuizMemoryQuestion(null);
        if (pendingQuizAdvanceRef.current) {
          clearTimeout(quizAdvanceTimeoutRef.current);
          quizAdvanceTimeoutRef.current = setTimeout(() => {
            quizAdvanceTimeoutRef.current = null;
            if (!quizMemoryOpenRef.current && !interactionPausedRef.current) pendingQuizAdvanceRef.current?.();
          }, 700);
        }
      };
      const openQuizMemory = () => {
        const question = shuffledQuestions[currentIndex];
        if (!question || study.blocked) return;
        lastFocusedElementRef.current = document.activeElement;
        quizMemoryOpenRef.current = true;
        setQuizMemoryQuestion(question);
        if (soundEnabled) playClick();
      };
      useEffect(() => () => {
        clearTimeout(quizAdvanceTimeoutRef.current);
        quizInteractionVersionRef.current += 1;
      }, []);
      const openHeaderDialog = (setOpen) => {
        lastFocusedElementRef.current = document.activeElement;
        setOpen(true);
      };
      const [textInput, setTextInput] = useState('');
      const [uploadTab, setUploadTab] = useState('file'); // file | text
      
      // إدارة الملفات والصور المتعددة ودمجها في مادة واحدة (Multi-File & Multi-Image State)
      const [selectedFiles, setSelectedFiles] = useState([]); // [{ id, file, name, size, type, isImage, isPDF, isWord, previewUrl }]
      const [isProcessingFiles, setIsProcessingFiles] = useState(false);
      const [isDragging, setIsDragging] = useState(false);
      
      // حالات إدارة التحدي والذاكرة
      const [allOriginalQuestions, setAllOriginalQuestions] = useState([]);
      const [wrongQuestions, setWrongQuestions] = useState([]);
      const [showTimerEndModal, setShowTimerEndModal] = useState(false);
      const [showResetWarningModal, setShowResetWarningModal] = useState(false);
      // Match DOM stacking order: the last rendered overlay owns keyboard focus.
      const activeStudyDialog = confirmation ? 'confirm' : legalPage ? 'legal' : showAdminDashboard ? 'admin' : showUserDashboard ? 'account' : showAuthModal ? 'auth' : showSettings ? 'settings' : showTimerEndModal ? 'timer' : showResetWarningModal ? 'reset' : quizMemoryQuestion ? 'quiz-memory' : null;
      const study = useStudySession({ owner: ownerKey, token: authToken, identityRef, paused: !!activeStudyDialog,
        onApply: run => {
          cancelQuizInteraction();
          setMode(run.completed && run.mode === 'quiz' ? 'result' : run.mode);
          if (run.mode === 'quiz') setShuffledQuestions(run.queue); else setQuestionsData(run.queue);
          setCurrentIndex(Math.min(run.currentIndex, Math.max(0, run.queue.length - 1)));
          setScore(run.score); setWrongQuestions(run.wrongQuestions); setConsecutiveStreak(run.consecutiveStreak);
          setIsAnswerChecked(false); setSelectedAnswer(null); setFillBlankSelected(null); setStudentShortAnswer(''); setShortAnswerEvaluation(null);
        },
        onConflict: () => setErrorAnnouncement({ type: t('تنبيه'), message: t('تغير التقدم في جلسة أخرى. استأنف آخر حفظ من قائمة المواد قبل المتابعة.') }),
        onError: () => setErrorAnnouncement({ type: t('تنبيه'), message: t('تعذر حفظ التقدم. استأنف آخر حفظ من قائمة المواد قبل المتابعة.') })
      });
      const timeLeft = study.seconds;
      const timerActive = study.running;
      const setTimerActive = value => study.changeTimer({ running: typeof value === 'function' ? value(study.running) : value });
      const setTimeLeft = value => {
        const next = typeof value === 'function' ? value(study.seconds) : value;
        study.changeTimer({ extendMs: next * 1000 - remainingMs(study.runRef.current?.timer) });
      };
      const beginRun = (targetMode, source = questionsData) => {
        if (study.blocked || !source.length) return;
        materialSelectionRef.current += 1;
        cancelQuizInteraction();
        setShowTimerEndModal(false);
        setQuestionsData(source);
        setShowHint(false); setIsAnswerRevealed(false); setShowWhy(false);
        const run = study.fresh(targetMode, source, allOriginalQuestions.length ? allOriginalQuestions : source, currentMaterialId || completedGenerationId || 'demo');
        requestAnimationFrame(() => document.querySelector('[data-study-heading]')?.focus());
        if (run?.queue[0]) speak(run.queue[0]);
        return run;
      };
      interactionPausedRef.current = !!activeStudyDialog;
      useEffect(() => {
        if (!activeStudyDialog && pendingQuizAdvanceRef.current && !quizAdvanceTimeoutRef.current) {
          quizAdvanceTimeoutRef.current = setTimeout(() => {
            quizAdvanceTimeoutRef.current = null;
            if (!interactionPausedRef.current) pendingQuizAdvanceRef.current?.();
          }, 700);
        }
      }, [activeStudyDialog]);
      const hadStudyDialog = useRef(false);
      useEffect(() => {
        if (!activeStudyDialog) {
          if (hadStudyDialog.current) lastFocusedElementRef.current?.focus();
          hadStudyDialog.current = false;
          return;
        }
        hadStudyDialog.current = true;
        const dialog = document.querySelector(`[data-study-dialog="${activeStudyDialog}"]`);
        if (!dialog) return;
        const focusable = () => [...dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
          .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length && !element.closest('[hidden], [inert]'));
        const focusDialog = () => (focusable()[0] || dialog).focus();
        focusDialog();
        const closeDialog = { legal: () => setLegalPage(null), confirm: resolveConfirmation, admin: setShowAdminDashboard, account: setShowUserDashboard, auth: setShowAuthModal, settings: setShowSettings, timer: setShowTimerEndModal, reset: setShowResetWarningModal, 'quiz-memory': closeQuizMemory }[activeStudyDialog];
        const handleDialogKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeDialog(false);
          } else if (event.key === 'Tab') {
            const controls = focusable();
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (!first || !dialog.contains(document.activeElement) || document.activeElement === dialog || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
              event.preventDefault();
              (event.shiftKey ? last || dialog : first || dialog).focus();
            }
          }
        };
        const containFocus = (event) => {
          if (!dialog.contains(event.target)) focusDialog();
        };
        document.addEventListener('keydown', handleDialogKey, true);
        document.addEventListener('focusin', containFocus);
        return () => {
          document.removeEventListener('keydown', handleDialogKey, true);
          document.removeEventListener('focusin', containFocus);
        };
      }, [activeStudyDialog]);
      
      const fileInputRef = useRef(null);

      // ربط نافذة الإبلاغ عن الأخطاء عالمياً
      useEffect(() => {
        window.__reportAppError = (type, message) => {
          setErrorAnnouncement({ type, message, timestamp: new Date() });
        };
        return () => { window.__reportAppError = null; };
      }, []);

      // إخفاء التنبيهات والإعلانات تلقائياً بعد 6 ثوانٍ لضمان عدم حجب الشاشة أو بقائها معلقة
      useEffect(() => {
        if (errorAnnouncement) {
          const timer = setTimeout(() => setErrorAnnouncement(null), 6000);
          return () => clearTimeout(timer);
        }
      }, [errorAnnouncement]);

      useEffect(() => {
        if (appAnnouncement) {
          const timer = setTimeout(() => setAppAnnouncement(null), 7000);
          return () => clearTimeout(timer);
        }
      }, [appAnnouncement]);

      // تنظيف وإلغاء أي تحديد مسبق وإعادة ضبط الاسترجاع النشط والتنبيه الصوتي الذاكرتي الخفي (TMR)
      // مع إخفاء الملاحظات والإنذارات تلقائياً عند الانتقال لسؤال أو مرحلة جديدة
      useEffect(() => {
        cancelQuizInteraction();
        quizMemoryOpenRef.current = false;
        setQuizMemoryQuestion(null);
        setSelectedAnswer(null);
        setIsAnswerChecked(false);
        setIsAnswerRevealed(false);
        setShowWhy(false);
        setFillBlankSelected(null);
        setErrorAnnouncement(null);
        setAppAnnouncement(null);
        requestAnimationFrame(() => document.querySelector('[data-study-heading]')?.focus());
        // رنين التذكر الذاكرتي التوافقي (Targeted Memory Reactivation - TMR)
        if (soundEnabled && (mode === 'learn' || mode === 'quiz')) {
          const targetItem = mode === 'quiz' ? shuffledQuestions[currentIndex] : questionsData[currentIndex];
          if (targetItem) {
            playMemoryAnchor(targetItem.soundAnchorId || currentIndex);
          }
        }
      }, [currentIndex, mode]);

      // تحميل مسبق فوري في الخلفية لصوت السؤال القادم ولصوت النتيجة النهائية لتصفير زمن التأخير (Zero-Delay Voice Engine)
      useEffect(() => {
        if (mode === 'quiz') {
          if (shuffledQuestions[currentIndex + 1]) {
            prefetch(shuffledQuestions[currentIndex + 1]);
          } else if (currentIndex === shuffledQuestions.length - 1 && shuffledQuestions.length > 0) {
            // نحن في السؤال الأخير من الاختبار! نقوم بالتحميل المسبق الفوري لصوت النتيجة للسيناريوهين الممكنين (إجابة صحيحة أو خاطئة)
            const totalQ = shuffledQuestions.length;
            const scoreWin = score + 1;
            const scoreSame = score;
            prefetch(getFinishSpeechText(playerName, scoreWin, totalQ, Math.round((scoreWin / totalQ) * 100)));
            prefetch(getFinishSpeechText(playerName, scoreSame, totalQ, Math.round((scoreSame / totalQ) * 100)));
          }
        } else if (mode === 'learn' && questionsData[currentIndex + 1]) {
          prefetch(questionsData[currentIndex + 1]);
        }
      }, [currentIndex, mode, shuffledQuestions, questionsData, voiceEnabled, score, playerName]);

      // Restore only the current owner; guest state survives browser close, never migrates to accounts.
      useEffect(() => {
        identityRef.current = authToken;
        materialSelectionRef.current += 1;
        study.clear();
        generationRef.current?.controller.abort();
        cancelQuizInteraction();
        stopAllSpeech();
        setActiveMaterialContext({ generationId: null, materialId: null });
        clearNarration();
        setCurrentMaterialId(null);
        setCompletedGenerationId(null);
        setQuestionsData([]);
        setAllOriginalQuestions([]);
        setShuffledQuestions([]);
        setWrongQuestions([]);
        setCurrentIndex(0);
        setScore(0);
        setSelectedAnswer(null);
        setStudentShortAnswer('');
        setShortAnswerEvaluation(null);
        setIsEvaluatingShortAnswer(false);
        setIsAnswerChecked(false);
        setTimerActive(false);
        if (recognitionRef.current) {
          recognitionRef.current.onresult = null;
          try { recognitionRef.current.abort(); } catch (_) {}
          recognitionRef.current = null;
        }
        setIsListeningSpeech(false);
        setMode('setup');
        setUserMaterials([]);
        setShowUserDashboard(false);
        setShowAdminDashboard(false);
        setAdminUsers([]);
        setAdminStats(null);
        setAdminQuotaEdits({});
        setErrorAnnouncement(null);
        setAppAnnouncement(null);
        setGuestSavedMaterial(null);
        setMaterialQuota(null);
        setErrorMsg('');
        setTextInput('');
        selectedFiles.forEach(item => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
        setSelectedFiles([]);
        setPlayerName('');
        refreshMaterialQuota(authToken).catch(() => {});
        try {
          sessionStorage.removeItem('smartExamSession'); // Discard legacy, unscoped state.
          const savedState = authToken ? sessionStorage.getItem('smartExamAccountSession') : localStorage.getItem(GUEST_MATERIAL_KEY);
          if (savedState) {
            const parsed = JSON.parse(savedState);
            if (parsed.owner === ownerKey && Array.isArray(parsed.questionsData) && parsed.questionsData.map(normalizeQuestion).filter(Boolean).length) {
              if (parsed.mode === 'quiz' && (!Array.isArray(parsed.shuffledQuestions) || !parsed.shuffledQuestions.map(normalizeQuestion).filter(Boolean).length)) parsed.mode = 'intro';
              if (!authToken) {
                setGuestSavedMaterial(parsed);
                if (!guestWorkspaceActive(localStorage, parsed)) { setPlayerName(parsed.playerName || ''); setMode('upload'); setSessionOwner(ownerKey); return; }
              }
              setCurrentMaterialId(authToken ? parsed.materialId || null : null);
              setCompletedGenerationId(parsed.generationId || null);
              setActiveMaterialContext(authToken ? { materialId: parsed.materialId || null } : { generationId: parsed.generationId || null });
              setPlayerName(parsed.playerName || '');
              setMode(['intro', 'learn', 'quiz', 'result'].includes(parsed.mode) ? parsed.mode : 'intro');
              setQuestionsData(normalizeQuestions(parsed.questionsData));
              setAllOriginalQuestions(normalizeQuestions(parsed.allOriginalQuestions || parsed.questionsData));
              setCurrentIndex(clampStudyIndex(parsed.currentIndex, parsed.mode === 'quiz' ? (parsed.shuffledQuestions || []).map(normalizeQuestion).filter(Boolean).length : parsed.questionsData.map(normalizeQuestion).filter(Boolean).length));
              setScore(parsed.score || 0);
              if (parsed.run && parsed.run.owner === ownerKey && ['learn','quiz','result'].includes(parsed.mode)) {
                if (authToken && parsed.materialId) {
                  study.resume(parsed.run.mode, parsed.allOriginalQuestions || parsed.questionsData, parsed.materialId, { keepCompleted: parsed.mode === 'result' }).catch(() => notify(t('تعذر حفظ التقدم. حاول مرة أخرى.')));
                } else study.hydrate(parsed.run);
              }
              else if (['learn','quiz'].includes(parsed.mode)) {
                const legacy = restoreRun({ owner: ownerKey, materialKey: parsed.materialId || parsed.generationId || 'demo', mode: parsed.mode,
                  questions: parsed.allOriginalQuestions || parsed.questionsData, progress: { state: { ...parsed, shuffledQuestions: parsed.mode === 'learn' ? parsed.questionsData : parsed.shuffledQuestions } } });
                study.hydrate(legacy);
              }
              setGenerationStatus(parsed.generationStatus || 'drafting');
              if (parsed.mode === 'quiz' && parsed.shuffledQuestions) {
                setShuffledQuestions(normalizeQuestions(parsed.shuffledQuestions));
              }
              if (parsed.wrongQuestions) {
                setWrongQuestions(normalizeQuestions(parsed.wrongQuestions));
              }
            }
          }
        } catch (e) { setErrorMsg(t('تعذر استعادة المادة المحفوظة على هذا الجهاز.')); }
        setSessionOwner(ownerKey);
        return () => { stopAmbientMusic(); generationRef.current?.controller.abort(); };
      }, [ownerKey, authToken]);

      // Persist only actual materials; clearing the upload workspace must not erase the guest's one material.
      useEffect(() => {
        if (sessionOwner !== ownerKey || identityRef.current !== authToken || !questionsData.length ||
            !['intro', 'learn', 'quiz', 'result'].includes(mode) || (!currentMaterialId && !completedGenerationId)) return;
        // Checked answers have already changed score: persist the next question, not a double-scoreable answer.
        const nextIndex = mode === 'quiz' && isAnswerChecked ? currentIndex + 1 : currentIndex;
        const savedMode = mode === 'quiz' && isAnswerChecked && nextIndex >= shuffledQuestions.length ? 'result' : mode;
        const state = { owner: ownerKey, materialId: currentMaterialId, generationId: completedGenerationId,
          playerName, mode: savedMode, questionsData, allOriginalQuestions, wrongQuestions, currentIndex: nextIndex, score,
          run: study.runRef.current, timeLeft, timerActive: savedMode === 'result' ? false : timerActive, generationStatus, shuffledQuestions };
        try {
          if (authToken) sessionStorage.setItem('smartExamAccountSession', JSON.stringify(state));
          else {
            localStorage.setItem(GUEST_MATERIAL_KEY, JSON.stringify(state));
            activateGuestWorkspace(localStorage, state.generationId);
            setGuestSavedMaterial(state);
          }
        } catch (e) { setErrorMsg(t('تعذر الحفظ على هذا الجهاز. لا تغلق المتصفح قبل إنهاء الدراسة.')); }
      }, [authToken, sessionOwner, playerName, mode, questionsData, allOriginalQuestions, wrongQuestions, currentIndex, score, timerActive, generationStatus, shuffledQuestions, currentMaterialId, completedGenerationId, isAnswerChecked]);

      useEffect(() => {
        if (timeLeft === 0 && timerActive && (mode === 'quiz' || mode === 'learn')) {
          study.changeTimer({ running: false });
          setShowTimerEndModal(true);
        }
      }, [timeLeft, timerActive, mode]);

      const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
      };

      // Browsers require a user gesture before audio can play. Keep focus audio
      // enabled by default and unlock it on the first pointer or keyboard action.
      useEffect(() => {
        if (!musicEnabled) {
          stopAmbientMusic();
          return;
        }
        const unlockFocusAudio = () => {
          if (!audioRuntime.mainGain || audioRuntime.activeBinauralType !== binauralMode) {
            startAmbientMusic(binauralMode);
          } else {
            initAudio();
          }
        };
        if (audioRuntime.audioCtx?.state === 'running') unlockFocusAudio();
        return installOneTimeUnlock(document, unlockFocusAudio);
      }, [musicEnabled, binauralMode]);

      const handleToggleMusic = () => {
        initAudio();
        if (musicEnabled) {
          stopAmbientMusic();
          setMusicEnabled(false);
        } else {
          startAmbientMusic(binauralMode);
          setMusicEnabled(true);
        }
      };

      const handleSwitchBinauralMode = (targetMode) => {
        initAudio();
        setBinauralMode(targetMode);
        localStorage.setItem('binaural_mode', targetMode);
        if (musicEnabled) {
          startAmbientMusic(targetMode);
        }
      };

      const handleToggleSound = () => {
        initAudio();
        const next = !soundEnabled;
        setSoundEnabled(next);
        if (next) setTimeout(playClick, 40);
      };

      useEffect(() => { if (!voiceEnabled) clearNarration(); return clearNarration; }, [voiceEnabled]);
      const handleToggleVoice = () => {
        const next = !voiceEnabled;
        setVoiceEnabled(next);
        localStorage.setItem('voice_narrator_enabled', next ? 'true' : 'false');
        if (!next) {
          stopAllSpeech();
        }
      };

      const handleNameSubmit = (e) => {
        e.preventDefault();
        initAudio();
        if (musicEnabled && !audioRuntime.mainGain) startAmbientMusic(binauralMode);
        if (soundEnabled) playClick();
        const name = playerName.trim() || 'بطل التحدي';
        setPlayerName(name);
        setMode('upload');
      };

      // تمديد 5 دقائق متاح فقط في الدقيقة الأخيرة
      const canExtendTimer = (timeLeft <= 60 && timeLeft > 0);

      const handleExtendTimer = () => {
        if (!canExtendTimer) return;
        if (soundEnabled) playClick();
        setTimeLeft(t => t + 300);
      };

      // نافذة التحذير قبل مسح المادة ورفع ملف جديد
      const handleRequestNewMaterial = () => {
        if (questionsData.length > 0 && mode !== 'upload' && mode !== 'setup') {
          setShowResetWarningModal(true);
        } else {
          resetToUpload();
        }
      };

      const resetToUpload = () => {
        materialSelectionRef.current += 1;
        study.clear();
        clearNarration();
        if (!authToken) deactivateGuestWorkspace(localStorage);
        if (soundEnabled) { initAudio(); playClick(); }
        setShowResetWarningModal(false);
        setShowTimerEndModal(false);
        setMode('upload');
        setActiveMaterialContext({});
        setCurrentMaterialId(null);
        setCompletedGenerationId(null);
        setQuestionsData([]);
        setAllOriginalQuestions([]);
        setWrongQuestions([]);
        setCurrentIndex(0);
        setScore(0);
        setSelectedAnswer(null);
        setStudentShortAnswer('');
        setShortAnswerEvaluation(null);
        setIsEvaluatingShortAnswer(false);
        setIsAnswerChecked(false);
        setTimerActive(false);
        setTimeLeft(15 * 60);
        try {
          sessionStorage.removeItem('smartExamSession');
          if (authToken) sessionStorage.removeItem('smartExamAccountSession');
          if (authToken) sessionStorage.removeItem(`smartExamTimer:${ownerKey}`);
        } catch(e){}
      };

      // إعادة دراسة المادة من البداية
      const handleStartOverStudy = () => beginRun('learn', allOriginalQuestions.length ? allOriginalQuestions : questionsData);
      const handleStartOverQuiz = () => beginRun('quiz', allOriginalQuestions.length ? allOriginalQuestions : questionsData);

      // One reservation covers draft + revision + save, never study, TTS or evaluation.
      const processMaterial = async (materialPayload) => {
        if (!authToken) {
          setErrorMsg(uiLanguage === 'ar' ? 'سجّل الدخول لإنشاء مادة جديدة بالذكاء الاصطناعي. يمكنك متابعة المادة المحفوظة على هذا الجهاز دون توليد جديد.' : 'Sign in to generate new AI material. You can still study material already saved on this device without new generation.');
          openHeaderDialog(setShowAuthModal);
          return;
        }
        if (generationRef.current) return;
        if (!canGenerateMaterial) {
          setErrorMsg(quotaError || t('لا توجد مواد متبقية. يمكنك متابعة مذاكرة المادة المحفوظة أو طلب زيادة الحد من المشرف.'));
          return;
        }
        const token = authToken;
        const controller = new AbortController();
        const job = { token, controller, generationId: null, completed: false };
        generationRef.current = job;
        setGenerationStatus('drafting');
        setErrorMsg('');
        try {
          // Refresh server truth before showing generation; the reservation is authoritative.
          const quota = await refreshMaterialQuota(token);
          if (identityRef.current !== token) return;
          if (!quota || !quota.canGenerate) throw new Error(t('لا توجد مواد متبقية. يمكنك متابعة مذاكرة المادة المحفوظة أو طلب زيادة الحد من المشرف.'));
          const started = await materialApi('/api/material-generations/start', { token, method: 'POST', body: {}, signal: controller.signal });
          job.generationId = started.generationId;
          if (!job.generationId) throw new Error('The server did not confirm the material reservation.');
          if (identityRef.current !== token) throw new Error('Account changed.');
          if (started.quota) setMaterialQuota(started.quota);
          setMode('generating');
          const draftQuestions = await draftQuizFromMaterial({ material: materialPayload, generationId: job.generationId, signal: controller.signal });
          if (!draftQuestions || !Array.isArray(draftQuestions) || draftQuestions.length === 0) {
            throw new Error("لم يتم العثور على أسئلة واضحة في المحتوى المرفوع.");
          }

          if (identityRef.current !== token || controller.signal.aborted) throw new DOMException('Account changed.', 'AbortError');
          // المرحلة 2: المراجعة الأكاديمية
          setGenerationStatus('revising');
          let finalQuestions = draftQuestions;
          try {
            const revised = await reviseQuizDraft({ material: materialPayload, draftQuestions, generationId: job.generationId, signal: controller.signal });
            if (revised?.length) finalQuestions = revised;
          } catch (e) {
            if (controller.signal.aborted || identityRef.current !== token) throw e;
            console.warn('Academic revision skipped; preserved complete draft:', e.message);
          }

          let sanitized = normalizeQuestions(finalQuestions);
          if (sanitized.length === 0) {
            throw new Error("لم يتم العثور على أسئلة واضحة في المحتوى المرفوع.");
          }

          if (identityRef.current !== token) throw new Error('Account changed.');
          const materialTitle = (materialPayload && materialPayload.title)
            || (selectedFiles && selectedFiles.length > 0 ? selectedFiles.map(f => f.name || f.file?.name).filter(Boolean).join(' + ') : null)
            || (textInput ? textInput.trim().slice(0, 30) + '...' : null)
            || `مادة اختبار (${sanitized.length} سؤال)`;
          const completed = await saveMaterialToDb(materialTitle, sanitized, job.generationId, token, controller.signal);
          const canonical = completed.questions || completed.material?.questions;
          if (Array.isArray(canonical)) sanitized = normalizeQuestions(canonical);
          job.completed = true;
          if (!token) {
            const saved = { owner: 'guest', title: materialTitle, generationId: job.generationId, playerName,
              mode: 'intro', questionsData: sanitized, allOriginalQuestions: sanitized, shuffledQuestions: [],
              wrongQuestions: [], currentIndex: 0, score: 0, timeLeft: 15 * 60, timerActive: false };
            setGuestSavedMaterial(saved);
            try { localStorage.setItem(GUEST_MATERIAL_KEY, JSON.stringify(saved)); }
            catch (e) { window.__reportAppError?.('Local save', t('تعذر الحفظ على هذا الجهاز. لا تغلق المتصفح قبل إنهاء الدراسة.')); }
          }
          clearNarration(); study.clear();
          setQuestionsData(sanitized);
          setAllOriginalQuestions(sanitized);
          setWrongQuestions([]);
          setCurrentIndex(0);
          setScore(0);
          setMode('intro');
          triggerConfetti();
          if (soundEnabled) playCorrect();

          // إعلان اكتمال إنشاء وتجهيز المادة الدراسية ودمج المرفقات
          const welcomeSpeech = getContentLanguage(sanitized[0]).startsWith('ar')
            ? `أهلاً بك يا ${playerName || 'بطل'}! تم إعداد المادة الدراسية بنجاح ودمج كافة المرفقات، وابتكر المساعد الصوتي ${sanitized.length} أسئلة تفاعلية مع مفاتيح الحفظ السحرية. هل أنت مستعد للتحدي؟`
            : `Welcome${playerName ? `, ${playerName}` : ''}! Your material is ready with ${sanitized.length} interactive questions and memory hints. Are you ready to begin?`;
          setAppAnnouncement({
            type: 'material_created',
            title: uiText('تم إعداد وتجهيز المادة الدراسية بنجاح! 🎓✨'),
            message: uiText('قام الذكاء الاصطناعي بتحليل المادة ودمج المرفقات وصياغة {count} سؤالاً تفاعلياً بمفاتيح حفظ سحرية.', {count: sanitized.length}),
            speechText: welcomeSpeech,
            icon: 'fa-graduation-cap',
            badge: uiText('{count} أسئلة جاهزة', {count: sanitized.length}),
            timestamp: Date.now()
          });

          // نطق الإعلان فوراً بصوت المساعد الصوتي لـ Vertex AI أو AI Studio
          speak(welcomeSpeech);
        } catch (err) {
          console.error(err);
          if (identityRef.current === token) {
            const errorText = err.message || 'تعذر معالجة المحتوى. يرجى المحاولة لاحقاً أو التواصل مع المشرف.';
            setErrorMsg(errorText);
            setErrorAnnouncement({ type: 'Brain / API Error', message: errorText });
            setMode('upload');
          }
        } finally {
          if (job.generationId && !job.completed) {
            try { await materialApi(`/api/material-generations/${encodeURIComponent(job.generationId)}`, { token, method: 'DELETE' }); }
            catch (e) { if (identityRef.current === token) setErrorMsg(prev => `${prev} — ${e.message}`); }
          }
          if (generationRef.current === job) generationRef.current = null;
          if (identityRef.current === token) refreshMaterialQuota(token).catch(() => {});
        }
      };

      // تنسيق حجم الملف للعرض البصري الجميل
      const formatFileSize = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
      };

      // قراءة الملف بصيغة Base64
      const readFileAsBase64 = (file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = reader.result;
            const base64 = typeof res === 'string' ? res.split(',')[1] : '';
            resolve(base64);
          };
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(file);
        });
      };

      // تحسين أبعاد الصور الضخمة المأخوذة بكاميرا الهاتف/الآيباد لتسريع الرفع والتوليد
      const optimizeImageFile = async (file) => {
        if (!file.type.startsWith('image/')) return file;
        if (file.size < 2.5 * 1024 * 1024) return file;
        try {
          return await withBitmap(file, createImageBitmap, async bitmap => {
          const maxDimension = 1800;
          if (bitmap.width <= maxDimension && bitmap.height <= maxDimension) return file;
          let w = bitmap.width;
          let h = bitmap.height;
          if (w > h) {
            h = Math.round((h * maxDimension) / w);
            w = maxDimension;
          } else {
            w = Math.round((w * maxDimension) / h);
            h = maxDimension;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(bitmap, 0, 0, w, h);
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
          if (blob) {
            return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          }
          return file;
          });
        } catch (e) {
          console.warn("Image optimization fallback:", e);
        }
        return file;
      };

      // معالجة اختيار ملفات وصور متعددة (تراكمية)
      const handleFilesSelected = (fileList) => {
        if (!canGenerateMaterial) return;
        if (!fileList || fileList.length === 0) return;
        const newFiles = Array.from(fileList);
        const processed = newFiles.map(file => {
          const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp|heic)$/i.test(file.name);
          const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
          const isWord = file.name.toLowerCase().endsWith('.docx') || file.type.includes('wordprocessingml');
          const previewUrl = isImage ? URL.createObjectURL(file) : null;
          return {
            id: Math.random().toString(36).substring(2, 9) + Date.now(),
            file,
            name: file.name,
            size: file.size,
            type: file.type || (isPDF ? 'application/pdf' : isImage ? 'image/jpeg' : ''),
            isImage,
            isPDF,
            isWord,
            previewUrl
          };
        }).filter(f => f.isImage || f.isPDF || f.isWord);

        if (processed.length === 0) {
          const err = "يرجى رفع ملفات بصيغ مدعومة: (صور JPG/PNG/WebP، ملفات PDF، أو مستندات Word .docx)";
          setErrorMsg(err);
          setErrorAnnouncement({ type: 'File Format Error', message: err });
          return;
        }

        setErrorMsg("");
        setSelectedFiles(prev => [...prev, ...processed]);
        if (soundEnabled) playClick();
      };

      // حذف ملف محدد من قائمة الملفات المختارة
      const handleRemoveFile = (idToRemove) => {
        setSelectedFiles(prev => {
          const target = prev.find(f => f.id === idToRemove);
          if (target && target.previewUrl) {
            URL.revokeObjectURL(target.previewUrl);
          }
          return prev.filter(f => f.id !== idToRemove);
        });
        if (soundEnabled) playClick();
      };

      // تفريغ كافة الملفات المحددة
      const handleClearAllFiles = () => {
        selectedFiles.forEach(f => {
          if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
        });
        setSelectedFiles([]);
        if (soundEnabled) playClick();
      };

      // دمج ومعالجة كافة الملفات والصور المختارة في مادة موحدة وبدء استخراج الأسئلة
      const handleProcessAllFiles = async () => {
        if (!canGenerateMaterial || generationRef.current) return;
        if (selectedFiles.length === 0) {
          const msg = "يرجى اختيار صورة أو ملف واحد على الأقل قبل بدء التوليد.";
          setErrorMsg(msg);
          setErrorAnnouncement({ type: 'Selection Required', message: msg });
          return;
        }

        setIsProcessingFiles(true);
        setErrorMsg("");
        if (soundEnabled) playClick();

        try {
          const items = [];
          for (let i = 0; i < selectedFiles.length; i++) {
            const item = selectedFiles[i];
            let f = item.file;

            if (item.isWord) {
              if (!window.mammoth) {
                throw new Error("جاري تحميل مكتبة قراءة ملفات Word، يرجى المحاولة بعد قليل.");
              }
              const arrayBuffer = await f.arrayBuffer();
              const result = await window.mammoth.extractRawText({ arrayBuffer });
              const extractedText = (result.value || '').trim();
              if (extractedText) {
                items.push({
                  type: 'text',
                  name: f.name || `مستند ${i + 1}`,
                  data: extractedText
                });
              }
            } else {
              // تحسين الصورة إذا كانت ضخمة
              if (item.isImage) {
                f = await optimizeImageFile(f);
              }
              const base64Data = await readFileAsBase64(f);
              if (base64Data) {
                items.push({
                  type: 'file',
                  name: f.name || `مرفق ${i + 1}`,
                  mimeType: f.type || (item.isPDF ? 'application/pdf' : 'image/jpeg'),
                  data: base64Data
                });
              }
            }
          }

          if (items.length === 0) {
            throw new Error("تعذر استخراج محتوى صالح من الملفات المحددة.");
          }

          // بناء حمولة المادة الموحدة (Composite Session Payload)
          const fileTitle = selectedFiles.map(f => f.name || f.file?.name).filter(Boolean).join(' + ');
          const materialPayload = {
            type: 'multi',
            title: fileTitle || 'مادة مرفوعة',
            items
          };

          await processMaterial(materialPayload);
        } catch (err) {
          console.error("Multi-file processing error:", err);
          setErrorMsg(err.message || "حدث خطأ أثناء قراءة ومعالجة الملفات.");
          setErrorAnnouncement({ type: 'File Process Error', message: err.message || 'حدث خطأ أثناء معالجة الملفات.' });
        } finally {
          setIsProcessingFiles(false);
        }
      };

      const handleTextSubmit = async () => {
        if (!canGenerateMaterial || generationRef.current) return;
        if (!textInput.trim()) {
          const err = "الرجاء كتابة أو لصق نص المادة أو الأسئلة.";
          setErrorMsg(err);
          setErrorAnnouncement({ type: 'Input Error', message: err });
          return;
        }
        await processMaterial({
          type: 'text',
          title: textInput.trim().slice(0, 30) + (textInput.trim().length > 30 ? '...' : ''),
          data: textInput.trim()
        });
      };

      // تجربة أسئلة جاهزة للتجربة الفورية (تشمل الاختيار من متعدد، إكمال الفراغ، الأسئلة المقالية، والترميز المزدوج)
      const loadDemoQuestions = () => {
        clearNarration(); study.clear();
        setActiveMaterialContext({});
        setCurrentMaterialId(null);
        setCompletedGenerationId(null);
        if (soundEnabled) playClick();
        const demo = [
          {
            type: "mcq",
            text: "ما هو الكوكب الأقرب إلى الشمس في مجموعتنا الشمسية؟",
            options: ["الزهرة", "عطارد", "المريخ", "الأرض"],
            correct: 1,
            expectedAnswer: "عطارد",
            hint: "تذكر: (عطارد) سريع كالعطار 🏃♂️ يسبق الجميع ويكون الأول بجانب الشمس! ☀️",
            visualSketch: "تخيل كوكباً صغيراً يرتدي حذاء ركض سريع ويشرب عصيراً مثلجاً على شاطئ الشمس الذهبية! 👟🥤☀️",
            whyExplanation: "لأنه أول كوكب يدور في المدار الداخلي الأقرب لمركز المجموعة الشمسية.",
            coreConcept: "كوكب عطارد",
            soundAnchorId: 0
          },
          {
            type: "fill_blank",
            text: "تسمى العملية التي يصنع بها النبات غذاءه باستخدام ضوء الشمس عملية البناء الضوئي.",
            clozeText: "تسمى العملية التي يصنع بها النبات غذاءه باستخدام ضوء الشمس عملية [_____].",
            missingWord: "البناء الضوئي",
            options: ["البناء الضوئي", "التنفس الخلوي", "التبخر السطحي", "الانقسام الخيطي"],
            correct: 0,
            expectedAnswer: "البناء الضوئي",
            hint: "تذكر: النبات مهندس عبقري 👷 يبني (بناء) طعامه من (الضوء)! 🌿☀️",
            visualSketch: "تخيل ورقة شجر ترتدي خوذة مهندس وتبني برجاً ذهبياً من حزم ضوء الشمس! 👷♂️🍃✨",
            whyExplanation: "لأن صبغة الكلوروفيل تحول طاقة الفوتونات الضوئية إلى طاقة كيميائية وغذاء سكري.",
            coreConcept: "صنع الغذاء النباتي",
            soundAnchorId: 1
          },
          {
            type: "short_answer",
            text: "علل: حدوث ظاهرة تعاقب فصول السنة الأربعة على كوكب الأرض.",
            options: [],
            correct: null,
            expectedAnswer: "بسبب دوران الأرض حول الشمس وميلان محور دورانها",
            hint: "تذكر: الأرض تدور حول شمسنا كأنها تركب أرجوحة مائلة 🌍🎡 فتتغير الفصول الأربعة بانتظام!",
            visualSketch: "تخيل كوكب الأرض يميل برأسه مبتسماً وهو يتزلج في دائرة واسعة حول الشمس الذهبية! 🎿☀️🌍",
            whyExplanation: "لأن ميل محور الأرض بزاوية 23.5 درجة يغير زاوية سقوط أشعة الشمس وحرارتها طوال العام.",
            coreConcept: "تعاقب الفصول الأربعة",
            soundAnchorId: 2
          },
          {
            type: "fill_blank",
            text: "الصبغة الخضراء المسؤولة عن امتصاص ضوء الشمس في النبات هي الكلوروفيل.",
            clozeText: "الصبغة الخضراء المسؤولة عن امتصاص ضوء الشمس في النبات هي [_____].",
            missingWord: "الكلوروفيل",
            options: ["الكلوروفيل", "الكاروتين", "الهيموجلوبين", "الميلانين"],
            correct: 0,
            expectedAnswer: "الكلوروفيل",
            hint: "تذكر: (كلوروفيل) كأنه مظلة شمسية ⛱️ تلتقط أشعة الشمس الذهبية لتطبخ للنبات أشهى وجبة! 🍃☀️",
            visualSketch: "تخيل مظلة شمسية خضراء عملاقة تلتقط أشعة الشمس وتصبها في قدر طعام لذيذ! ⛱️🍲",
            whyExplanation: "لأن جزيئات الكلوروفيل تمتص الأطوال الموجية الزرقاء والحمراء وتسمح بإنتاج الطاقة.",
            coreConcept: "صبغة الكلوروفيل",
            soundAnchorId: 3
          },
          {
            type: "mcq",
            text: "كم عدد قارات العالم الأساسية؟",
            options: ["5 قارات", "6 قارات", "7 قارات", "8 قارات"],
            correct: 2,
            expectedAnswer: "7 قارات",
            hint: "تذكر: أيام الأسبوع (7) وقارات كوكبنا أيضاً (7) تمشي معاً في تناغم! 🌍✨",
            visualSketch: "تخيل سبعة عمالقة ملونين يمسكون بأيدي بعضهم البعض حول الكرة الأرضية! 🤝🌍",
            whyExplanation: "القارات السبع هي آسيا، أفريقيا، أوروبا، أمريكا الشمالية، أمريكا الجنوبية، أستراليا، والقطبية.",
            coreConcept: "قارات العالم",
            soundAnchorId: 4
          },
          {
            type: "mcq",
            text: "تتحول المادة من الحالة السائلة إلى الغازية بعملية تسمى:",
            options: ["التجمد", "التبخر", "التكثف", "الانصهار"],
            correct: 1,
            expectedAnswer: "التبخر",
            hint: "تذكر: الماء الساخن يُطلق (بخاراً) يطير للسماء = (تبخر)! ☁️♨️",
            visualSketch: "تخيل قطرة ماء ترتدي أجنحة فراشة وتطير كالبخار إلى السماء وهي تلوح بيديها! 💧🦋☁️",
            whyExplanation: "لأن اكتساب الطاقة الحرارية يزيد من سرعة الجزيئات فتتغلب على قوى التماسك السائل.",
            coreConcept: "عملية التبخر",
            soundAnchorId: 0
          }
        ].map((q, i) => normalizeQuestion(q, i));
        setQuestionsData(demo);
        setAllOriginalQuestions(demo);
        setWrongQuestions([]);
        setMode('intro');
        triggerConfetti();
        if (soundEnabled) playCorrect();

        const demoSpeech = `أهلاً بك يا ${playerName || 'بطل'}! تم تجهيز مادة الأسئلة التجريبية بنجاح، وابتكر المساعد الصوتي ${demo.length} أسئلة متنوعة مع مفاتيح الحفظ السحرية. هل أنت مستعد؟`;
        setAppAnnouncement({
          type: 'material_created',
          title: uiText('تم إعداد وتجهيز مادة الأسئلة التجريبية! 🎓✨'),
          message: uiText('تم إعداد {count} أسئلة تفاعلية ومفاتيح حفظ سحرية بنجاح.', {count: demo.length}),
          speechText: demoSpeech,
          icon: 'fa-graduation-cap',
          badge: uiText('{count} أسئلة جاهزة', {count: demo.length}),
          timestamp: Date.now()
        });
        speak(demoSpeech);
      };

      const startLearning = () => {
        const run = study.runRef.current;
        if (mode === 'learn' && run?.mode === 'learn' && !run.completed) { setTimerActive(true); return; }
        beginRun('learn', allOriginalQuestions.length ? allOriginalQuestions : questionsData);
      };
      const startQuiz = () => beginRun('quiz', allOriginalQuestions.length ? allOriginalQuestions : questionsData);

      // إنهاء الاختبار وإعلان اكتمال جلسة الأسئلة (QA Finished Announcement)
      const finishQuiz = (finalScoreOverride = null, queue = shuffledQuestions, reviews = wrongQuestions) => {
        cancelQuizInteraction();
        const finalScore = finalScoreOverride !== null ? finalScoreOverride : score;
        const total = queue.length || questionsData.length || 1;
        saveProgressToDb(queue.length, finalScore, true, 'quiz', queue, { wrongQuestions: reviews });
        const percentage = Math.round((finalScore / total) * 100);

        if (soundEnabled) playWin();
        setMode('result');
        setTimerActive(false);
        triggerConfetti();

        const finishSpeech = getFinishSpeechText(playerName, finalScore, total, percentage);
        let finishBadge = percentage >= 85 ? 'إنجاز ممتاز 🏆' : percentage >= 50 ? 'إنجاز رائع 🌟' : 'واصل التحدي 💪';

        setAppAnnouncement({
          type: 'qa_finished',
          title: uiText('اكتملت جولة الأسئلة بنجاح! 🏁🎉'),
          message: uiText('أنهيت جميع الأسئلة يا {name}! نتيجتك: {score} من {total} ({percent}%).', {name: playerName || uiText('بطل'), score: finalScore, total, percent: percentage}),
          speechText: finishSpeech,
          icon: 'fa-trophy',
          badge: uiText(finishBadge),
          timestamp: Date.now()
        });

        // تشغيل صوت النتيجة المحمل مسبقاً فوراً (0ms تأخير)
        speak(finishSpeech);
      };

      const advanceQuiz = () => {
        const run = study.runRef.current;
        if (!run || run.mode !== 'quiz') return;
        if (run.completed) finishQuiz(run.score, run.queue, run.wrongQuestions);
        else { study.commit(run); speak(run.queue[run.currentIndex]); }
      };
      const recordChoiceAnswer = (isCorrect, delay = null) => {
        const run = study.runRef.current;
        if (!run || run.mode !== 'quiz' || study.blocked || run.currentIndex !== currentIndex) return;
        const next = answerTransition(run, isCorrect);
        study.hold(next);
        setIsAnswerChecked(true); setScore(next.score); setConsecutiveStreak(next.consecutiveStreak);
        setWrongQuestions(next.wrongQuestions); setShuffledQuestions(next.queue);
        if (soundEnabled) { initAudio(); isCorrect ? playCorrect() : playWrong(); }
        if (isCorrect) triggerConfetti();
        if (delay !== null) scheduleQuizAdvance(advanceQuiz, delay);
      };

      const handleAnswerClick = (index) => {
        if (isAnswerChecked || study.blocked) return;
        initAudio();
        setSelectedAnswer(index);
        setIsAnswerChecked(true);

        recordChoiceAnswer(index === shuffledQuestions[currentIndex].correct, 1200);
      };

      // إجابة وتوليد أسئلة إكمال الفراغ (Cloze Deletion / Generation Effect)
      const handleFillBlankClick = (optionWord) => {
        if (isAnswerChecked || study.blocked) return;
        initAudio();
        setFillBlankSelected(optionWord);
        setIsAnswerChecked(true);

        const currentQ = shuffledQuestions[currentIndex];
        const targetWord = currentQ.missingWord || currentQ.expectedAnswer || '';
        recordChoiceAnswer(normalizeArabicText(optionWord) === normalizeArabicText(targetWord), 1300);
      };

      // الاسترجاع النشط: تثبيت المفهوم في الذاكرة الدائمة (Active Recall Mastered)
      const handleMarkCardMastered = () => {
        const run = study.runRef.current;
        if (!run || run.mode !== 'learn' || study.blocked) return;
        const next = learnTransition(run, true);
        study.commit(next);
        if (soundEnabled) playMasteredTone();
        if (next.completed) beginRun('quiz', next.originalQuestions);
        else speak(next.queue[next.currentIndex]);
      };
      const handleMarkCardNeedsReview = () => {
        const run = study.runRef.current;
        if (!run || run.mode !== 'learn' || study.blocked) return;
        const next = learnTransition(run, false);
        study.commit(next); speak(next.queue[next.currentIndex]);
      };
      const navigateLearn = delta => {
        const run = study.runRef.current;
        if (!run || run.mode !== 'learn' || study.blocked) return;
        const currentIndex = clampStudyIndex(run.currentIndex + delta, run.queue.length);
        study.commit({ ...run, currentIndex, completed: false });
        speak(run.queue[currentIndex]);
      };

      // إرسال ومراجعة إجابة السؤال المقالي القصير بالذكاء الاصطناعي
      const handleShortAnswerSubmit = async () => {
        if (isAnswerChecked || isEvaluatingShortAnswer || study.blocked) return;
        if (!studentShortAnswer.trim()) {
          const msg = "يرجى كتابة إجابتك أولاً يا بطل! ✍️";
          setErrorAnnouncement({ type: 'تنبيه إدخال', message: msg });
          return;
        }

        initAudio();
        setIsEvaluatingShortAnswer(true);

        const currentQ = shuffledQuestions[currentIndex];
        const interactionVersion = quizInteractionVersionRef.current;
        const evaluation = await evaluateShortAnswerWithAi({
          questionText: currentQ.text,
          expectedAnswer: currentQ.expectedAnswer,
          studentAnswer: studentShortAnswer.trim(),
          hint: currentQ.hint,
          language: getContentLanguage(currentQ),
          materialId: currentMaterialId,
          generationId: completedGenerationId
        });

        // Ignore an AI result from a quiz that the student has left or restarted.
        if (interactionVersion !== quizInteractionVersionRef.current) return;
        setIsEvaluatingShortAnswer(false);
        setIsAnswerChecked(true);
        setShortAnswerEvaluation(evaluation);
        recordChoiceAnswer(evaluation.isCorrect);
      };

      // الانتقال للسؤال التالي بعد تقييم السؤال القصير
      const handleNextQuestion = () => {
        if (!isAnswerChecked) return;
        if (soundEnabled) playClick();
        advanceQuiz();
      };

      // ميزة الإملاء الصوتي عبر الميكروفون مع دعم فوري وموثوق لأجهزة iPad و iOS Safari
      const toggleVoiceInput = async () => {
        // إذا كان الميكروفون قيد التسجيل حالياً، نوقفه بهدوء
        if (isListeningSpeech) {
          if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch(e){}
            recognitionRef.current = null;
          }
          setIsListeningSpeech(false);
          return;
        }

        // إيقاف أي صوت أو نطق جاري فوراً لتحرير قناة الصوت في نظام iOS Safari
        stopAllSpeech();

        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) {
          setErrorAnnouncement({ 
            type: 'تنبيه الميكروفون', 
            message: 'على أجهزة iPad يرجى استخدام متصفح Safari للتحدث مباشرة عبر الميكروفون، أو استخدام لوحة المفاتيح.' 
          });
          return;
        }

        // في Safari على iPad: طلب إذن الميكروفون عبر getUserMedia لإظهار نافذة إذن النظام
        if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
          } catch (permErr) {
            console.warn("Microphone permission denied:", permErr);
            setErrorAnnouncement({
              type: 'إذن الميكروفون في iPad',
              message: 'يرجى السماح لـ Safari بالوصول للميكروفون من إعدادات المتصفح على iPad.'
            });
            return;
          }
        }

        try {
          const rec = new SpeechRec();
          const currentQ = (mode === 'quiz' ? shuffledQuestions[currentIndex] : questionsData[currentIndex]);
          rec.lang = getSpeechLocale(currentQ) || (getContentLanguage(currentQ) === 'en' ? 'en-US' : 'ar-SA');
          rec.continuous = false;
          rec.interimResults = true;
          rec.maxAlternatives = 1;

          let accumulatedTranscript = '';

          rec.onstart = () => {
            setIsListeningSpeech(true);
          };

          rec.onresult = (evt) => {
            let interim = '';
            let finalChunk = '';
            for (let i = evt.resultIndex; i < evt.results.length; ++i) {
              const res = evt.results[i][0];
              if (!res) continue;
              if (evt.results[i].isFinal) {
                finalChunk += (finalChunk ? ' ' : '') + res.transcript.trim();
              } else {
                interim += res.transcript;
              }
            }
            if (finalChunk) {
              accumulatedTranscript = (accumulatedTranscript ? accumulatedTranscript + ' ' : '') + finalChunk;
            }
            const textToSet = (accumulatedTranscript + (interim ? ' ' + interim : '')).trim();
            if (textToSet) {
              setStudentShortAnswer(textToSet);
            }
          };

          rec.onerror = (e) => {
            console.warn("Speech recognition error:", e);
            setIsListeningSpeech(false);
            recognitionRef.current = null;
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
              setErrorAnnouncement({
                type: 'إذن الميكروفون في iPad',
                message: 'يرجى السماح لـ Safari بالوصول للميكروفون وتفعيل "تمكين الإملاء" (Enable Dictation) في إعدادات لوحة المفاتيح على iPad.'
              });
            } else if (e.error === 'network') {
              setErrorAnnouncement({
                type: 'اتصال الميكروفون',
                message: 'يتطلب التعرف على الصوت في iPad اتصالاً مستقراً بالإنترنت لمعالجة الإملاء.'
              });
            }
          };

          rec.onend = () => {
            setIsListeningSpeech(false);
            recognitionRef.current = null;
          };

          recognitionRef.current = rec;
          rec.start();
        } catch(e) {
          console.warn("Speech recognition start failed:", e);
          setIsListeningSpeech(false);
          recognitionRef.current = null;
        }
      };

      const resumeGuestMaterial = () => {
        if (authToken || !guestSavedMaterial || sessionOwner !== 'guest') return;
        const saved = guestSavedMaterial;
        clearNarration();
        setQuestionsData(normalizeQuestions(saved.questionsData));
        setAllOriginalQuestions(normalizeQuestions(saved.allOriginalQuestions || saved.questionsData));
        setShuffledQuestions(normalizeQuestions(saved.shuffledQuestions));
        setWrongQuestions(normalizeQuestions(saved.wrongQuestions));
        setCompletedGenerationId(saved.generationId);
        setCurrentMaterialId(null);
        setActiveMaterialContext({ generationId: saved.generationId });
        setCurrentIndex(clampStudyIndex(saved.currentIndex, saved.mode === 'quiz' ? (saved.shuffledQuestions || []).map(normalizeQuestion).filter(Boolean).length : (saved.questionsData || []).map(normalizeQuestion).filter(Boolean).length));
        setScore(saved.score || 0);
        if (saved.run) study.hydrate(saved.run);
        else if (['learn','quiz'].includes(saved.mode)) study.hydrate(restoreRun({ owner: 'guest', materialKey: saved.generationId, mode: saved.mode,
          questions: saved.allOriginalQuestions || saved.questionsData, progress: { state: { ...saved, shuffledQuestions: saved.mode === 'learn' ? saved.questionsData : saved.shuffledQuestions } } }));
        activateGuestWorkspace(localStorage, saved.generationId);
        setMode(['intro', 'learn', 'quiz', 'result'].includes(saved.mode) ? saved.mode : 'intro');
      };

      const cancelPendingReservation = async () => {
        if (!materialQuota?.pendingGenerationId || generationRef.current || !await requestConfirmation(t('إلغاء الحجز لا يعيد مادة استهلكها توليد ناجح. هل تريد المتابعة؟'))) return;
        try {
          const data = await materialApi(`/api/material-generations/${encodeURIComponent(materialQuota.pendingGenerationId)}`, { token: authToken, method: 'DELETE' });
          if (identityRef.current === authToken) setMaterialQuota(data.quota);
        } catch (e) { setQuotaError(e.message); }
      };
      const renderMaterialQuota = () => {
        const countsAvailable = !quotaLoading && !quotaError && !!materialQuota;
        const count = (value) => countsAvailable ? (value ?? '—') : '—';
        const unlimited = countsAvailable && materialQuota.materialLimit === null;
        return (
          <section aria-label={t('إجمالي المواد')} aria-live="polite" aria-busy={quotaLoading} className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-indigo-950">
            <dl className="grid grid-cols-3 gap-2 text-center">
              {[
                ['المواد المستخدمة', count(materialQuota?.materialsUsed)],
                ['المواد المتبقية', unlimited ? '∞' : count(materialQuota?.remaining)],
                ['إجمالي المواد', unlimited ? '∞' : count(materialQuota?.materialLimit)]
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] sm:text-xs font-bold leading-relaxed">{t(label)}</dt>
                  <dd dir="ltr" className="mt-1 text-xl sm:text-2xl font-black tabular-nums break-all">{value}</dd>
                </div>
              ))}
            </dl>
            {quotaLoading ? <p role="status" className="mt-2 text-center text-xs">{t('جاري تحميل الأعداد...')}</p> : (quotaError || !materialQuota) && <p role="alert" className="mt-2 text-center text-xs text-rose-700">{t('تعذر تحميل الأعداد')}</p>}
          </section>
        );
      };
      const renderAllowanceExhaustedOverlay = () => {
        const isGuest = !currentUser || !authToken;
        return (
          <div
            className="absolute inset-0 z-20 bg-slate-900/80 backdrop-blur-[2px] rounded-3xl p-5 sm:p-6 flex flex-col items-center justify-center text-center text-white shadow-2xl animate-in fade-in duration-200"
            role="region"
            aria-label={t('نفد حد المواد')}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => e.preventDefault()}
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-3 text-amber-300 shadow-inner">
              <i className={`fa-solid ${isGuest ? 'fa-user-lock' : 'fa-hourglass-end'} text-2xl`}></i>
            </div>

            <h3 className="text-base sm:text-lg font-black text-white mb-1.5 leading-snug">
              {isGuest ? t('نفد حد المواد المتاحة للزائر') : t('استنفدت رصيد المواد المتاح لحسابك')}
            </h3>

            <p className="text-xs sm:text-sm text-slate-200/90 leading-relaxed max-w-sm mx-auto mb-4 font-medium">
              {isGuest
                ? t('سجّل الدخول لإنشاء مادة جديدة؛ يمكنك متابعة المادة المحفوظة سابقاً على هذا الجهاز.')
                : t('لقد استهلكت كامل المواد المخصصة لحسابك ({used} من {limit}). يمكنك متابعة موادك المحفوظة أو التواصل مع المشرف لزيادة الحد.', {
                    used: materialQuota?.materialsUsed ?? 0,
                    limit: materialQuota?.materialLimit ?? 1
                  })}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 w-full max-w-sm">
              {isGuest ? (
                <>
                  <button type="button"
                    onClick={() => openHeaderDialog(setShowAuthModal)}
                    className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 hover:from-blue-600 hover:to-indigo-700 text-white px-5 py-3 rounded-2xl font-black text-xs sm:text-sm shadow-lg shadow-indigo-500/30 transition transform hover:scale-[1.02] active:scale-95 cursor-pointer"
                  >
                    <i className="fa-solid fa-right-to-bracket text-sm"></i>
                    <span>{t('تسجيل الدخول / إنشاء حساب')}</span>
                  </button>
                  {guestSavedMaterial && (
                    <button type="button"
                      onClick={resumeGuestMaterial}
                      className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-3.5 py-3 rounded-2xl font-bold text-xs border border-white/25 transition cursor-pointer"
                      aria-label={t('متابعة المادة المحفوظة')} title={t('متابعة المادة المحفوظة')}
                    >
                      <i className="fa-solid fa-book-open"></i>
                      <span>{t('متابعة المادة')}</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button type="button"
                    onClick={() => { openHeaderDialog(setShowUserDashboard); fetchUserMaterials(); }}
                    className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 hover:from-blue-600 hover:to-indigo-700 text-white px-5 py-3 rounded-2xl font-black text-xs sm:text-sm shadow-lg shadow-indigo-500/30 transition transform hover:scale-[1.02] active:scale-95 cursor-pointer"
                  >
                    <i className="fa-solid fa-folder-open text-sm"></i>
                    <span>{t('استعراض موادي المحفوظة')}</span>
                  </button>
                  <button type="button"
                    onClick={() => openHeaderDialog(setShowAuthModal)}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-3.5 py-3 rounded-2xl font-bold text-xs border border-white/25 transition cursor-pointer"
                    aria-label={t('تبديل الحساب')} title={t('تبديل الحساب')}
                  >
                    <i className="fa-solid fa-user-plus"></i>
                    <span>{t('تبديل الحساب')}</span>
                  </button>
                </>
              )}
            </div>

            {materialQuota?.pendingGenerationId && !generationRef.current && (
              <button type="button"
                disabled={quotaLoading}
                onClick={cancelPendingReservation}
                className="mt-3 text-[11px] text-rose-300 hover:text-white underline font-bold transition cursor-pointer"
              >
                {t('إلغاء الحجز المعلق')}
              </button>
            )}

            <button type="button"
              onClick={loadDemoQuestions}
              className="mt-3 text-[11px] text-indigo-200 hover:text-white flex items-center gap-1 font-bold underline transition cursor-pointer"
            >
              <i className="fa-solid fa-bolt text-amber-300"></i>
              <span>{t('أو جرب اختباراً نموذجياً سريعاً')}</span>
            </button>
          </div>
        );
      };
      // Do not flash material from the previous owner while React resets the workspace.
      if (sessionOwner !== ownerKey) return <div role="status" className="p-8 text-center text-indigo-700">{t('جاري التحقق من حد المواد...')}</div>;
      const activeQuestion = mode === 'quiz' ? shuffledQuestions[currentIndex] : questionsData[currentIndex];
      return (
        <div className="min-h-screen flex flex-col justify-between items-center p-3 sm:p-6 font-cairo">
          
          {confirmation && <div className="fixed inset-0 bg-slate-900/70 z-[100] flex items-center justify-center p-4">
            <section data-study-dialog="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message" tabIndex={-1} className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
              <h2 id="confirmation-title" className="font-black text-lg">{t('تأكيد')}</h2>
              <p id="confirmation-message" className="my-4 text-slate-700">{confirmation}</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => resolveConfirmation(false)} className="px-4 py-3 border rounded-xl">{t('إلغاء')}</button>
                <button type="button" onClick={() => resolveConfirmation(true)} className="px-4 py-3 bg-rose-600 text-white rounded-xl">{t('متابعة')}</button>
              </div>
            </section>
          </div>}
          {/* Quiz memory: content stays in the material language; controls use the UI language. */}
          {quizMemoryQuestion && mode === 'quiz' && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5"
              onClick={(event) => { if (event.target === event.currentTarget && activeStudyDialog === 'quiz-memory') closeQuizMemory(); }}>
              <section id="quiz-memory-dialog" data-study-dialog="quiz-memory" role="dialog" aria-modal="true" aria-labelledby="quiz-memory-title" aria-describedby="quiz-memory-description" tabIndex={-1}
                dir={uiLanguage === 'ar' ? 'rtl' : 'ltr'} lang={uiLanguage}
                className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-indigo-100 max-h-[90dvh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <header className="px-5 sm:px-6 py-5 border-b border-indigo-100 bg-indigo-50/70 shrink-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span aria-hidden="true" className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0"><i className="fa-solid fa-lightbulb"></i></span>
                      <div>
                        <p className="text-xs font-bold text-indigo-600 mb-1">{t('استراحة تذكّر')}</p>
                        <h2 id="quiz-memory-title" className="font-black text-lg sm:text-xl text-indigo-950">{t('شرح ومفتاح الحفظ')}</h2>
                      </div>
                    </div>
                    <button type="button" onClick={closeQuizMemory} aria-label={t('إغلاق')}
                      className="p-2.5 rounded-xl bg-white border border-indigo-100 text-indigo-700 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition shrink-0">
                      <i aria-hidden="true" className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                  <p id="quiz-memory-description" className="text-xs sm:text-sm text-slate-600 font-semibold leading-relaxed mt-3">{t('راجع الفكرة ثم عد للإجابة. المؤقت متوقف أثناء الشرح.')}</p>
                </header>
                <div className="p-5 sm:p-6 space-y-4 overflow-y-auto overscroll-contain">
                  <div className="flex items-start gap-2 pb-4 border-b border-slate-100">
                    <p dir="auto" data-material-text lang={getContentLanguage(quizMemoryQuestion)} className="flex-1 text-sm font-bold text-slate-700 leading-relaxed">{quizMemoryQuestion.text}</p>
                    {renderSpeakerButton(quizMemoryQuestion)}
                  </div>
                  {[
                    { field: 'coreConcept', label: 'المفهوم الأساسي', icon: 'fa-tag', style: 'bg-indigo-50 border-indigo-200 text-indigo-950' },
                    { field: 'hint', label: 'مفتاح الحفظ', icon: 'fa-wand-magic-sparkles', style: 'bg-amber-50 border-amber-300 text-amber-950' },
                    { field: 'whyExplanation', label: 'سر الفكرة (لماذا؟):', icon: 'fa-lightbulb', style: 'bg-white border-amber-200 text-slate-800' },
                    { field: 'visualSketch', label: 'الرابط البصري التخيلي (تخيل المشهد بعينيك الآن):', icon: 'fa-palette', style: 'bg-slate-50 border-indigo-100 text-slate-800' }
                  ].filter(item => quizMemoryQuestion[item.field]).map(item => (
                    <section key={item.field} className={`p-4 rounded-2xl border ${item.style}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-black text-xs sm:text-sm leading-relaxed flex items-start gap-2"><i aria-hidden="true" className={`fa-solid ${item.icon} mt-0.5`}></i>{t(item.label)}</h3>
                        {renderSpeakerButton(quizMemoryQuestion[item.field], 'text-indigo-600 -mt-1')}
                      </div>
                      <p dir="auto" data-material-text lang={getContentLanguage(quizMemoryQuestion)} className="font-semibold text-sm sm:text-base leading-relaxed break-words">{quizMemoryQuestion[item.field]}</p>
                    </section>
                  ))}
                  {!['hint', 'whyExplanation', 'coreConcept', 'visualSketch'].some(field => quizMemoryQuestion[field]) && (
                    <p className="p-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 leading-relaxed">{t('لا يوجد شرح إضافي لهذا السؤال بعد. يمكنك مراجعته في بطاقات المذاكرة.')}</p>
                  )}
                </div>
                <footer className="px-5 sm:px-6 py-4 border-t border-slate-100 shrink-0">
                  <button type="button" onClick={closeQuizMemory} className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition">{t('العودة للسؤال')}</button>
                </footer>
              </section>
            </div>
          )}

          {/* Modal تحذير مسح المادة عند رفع ملف جديد */}
          {showResetWarningModal && (
            <div data-study-dialog="reset" role="dialog" aria-modal="true" aria-label={t('تنبيه: مسح المادة الحالية')} tabIndex={-1} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl text-center border border-slate-100 animate-in fade-in zoom-in duration-200">
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-2">{t('تنبيه: مسح المادة الحالية')}</h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-6">
                  {t('الانتقال لرفع مادة جديدة سيؤدي إلى مسح جميع الأسئلة ومفاتيح الحفظ ونتائج الاختبار السابقة. هل ترغب بالاستمرار؟')}
                </p>
                <div className="flex gap-3">
                  <button type="button"
                    onClick={resetToUpload}
                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl transition shadow-md shadow-rose-100"
                  >
                    {t('نعم، رفع مادة جديدة')}
                  </button>
                  <button type="button"
                    onClick={() => setShowResetWarningModal(false)}
                    className="flex-1 border-2 border-slate-200 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50 transition"
                  >
                    {t('إلغاء والعودة')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal انتهاء وقت المؤقت وتمديد 5 دقائق */}
          {showTimerEndModal && (
            <div data-study-dialog="timer" role="dialog" aria-modal="true" aria-label={t('انتهى الوقت المحدد! ⏰')} tabIndex={-1} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl text-center border border-slate-100 animate-in fade-in zoom-in duration-200">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl animate-pulse">
                  <i className="fa-solid fa-stopwatch"></i>
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-2">{t('انتهى الوقت المحدد! ⏰')}</h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-6">
                  {mode === 'learn' 
                    ? t('انتهى وقت المذاكرة المخصص! هل ترغب في تمديد 5 دقائق إضافية لمتابعة الحفظ، أم بدء الاختبار فوراً؟')
                    : t('انتهى وقت الاختبار المحدد! هل ترغب في تمديد الاختبار 5 دقائق إضافية لمتابعة الإجابة، أم إنهاء الاختبار وعرض النتيجة؟')}
                </p>
                <div className="flex flex-col gap-3">
                  <button type="button"
                    onClick={() => {
                      setTimeLeft(300);
                      setTimerActive(true);
                      setShowTimerEndModal(false);
                      if (soundEnabled) playClick();
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl transition shadow-md shadow-emerald-100 flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-plus"></i> {t('تمديد 5 دقائق والمتابعة')}
                  </button>
                  {mode === 'learn' ? (
                    <button type="button"
                      onClick={() => {
                        setShowTimerEndModal(false);
                        startQuiz();
                      }}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition shadow-md shadow-indigo-100 flex items-center justify-center gap-2"
                    >
                      <i className="fa-solid fa-play"></i> {t('بدء الاختبار فوراً')}
                    </button>
                  ) : (
                    <button type="button"
                      onClick={() => {
                        setShowTimerEndModal(false);
                        finishQuiz();
                      }}
                      className="w-full border-2 border-slate-200 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-50 transition"
                    >
                      {t('إنهاء وعرض النتيجة')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Modal إعدادات المزود والـ API والنماذج والموجات الصوتية */}
          {showSettings && <SettingsView t={t} renderLanguageToggle={renderLanguageToggle} legalTitles={legalTitles} openLegalPage={openLegalPage} generationRef={generationRef} refreshMaterialQuota={refreshMaterialQuota} handleToggleMusic={handleToggleMusic} handleSwitchBinauralMode={handleSwitchBinauralMode} cancelPendingReservation={cancelPendingReservation} renderMaterialQuota={renderMaterialQuota} setShowSettings={setShowSettings} musicEnabled={musicEnabled} binauralMode={binauralMode} pinkNoiseEnabled={pinkNoiseEnabled} setPinkNoiseEnabled={setPinkNoiseEnabled} pinkNoiseVolume={pinkNoiseVolume} setPinkNoiseVolume={setPinkNoiseVolume} materialQuota={materialQuota} quotaLoading={quotaLoading} quotaError={quotaError} />}

                    {showAuthModal && (
            <div data-study-dialog="auth" role="dialog" aria-modal="true" aria-label={t('دخول')} tabIndex={-1} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200">
                <button type="button"
                  aria-label={t('إغلاق')} onClick={() => setShowAuthModal(false)}
                  className="absolute top-4 left-4 text-slate-400 hover:text-slate-600 text-lg w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition cursor-pointer"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>

                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner text-2xl">
                    <i className="fa-solid fa-user-shield"></i>
                  </div>
                  <h3 className="text-xl font-black text-slate-800">{t('تسجيل الدخول إلى حسابك')}</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    {t('احفظ موادك واختباراتك في السيرفر واستأنف المذاكرة في أي وقت')}
                  </p>
                </div>

                <div className="space-y-3">
                  <nav aria-label={uiLanguage === 'ar' ? 'السياسات والدعم' : 'Policies and support'} className="flex gap-4 justify-center text-sm text-indigo-700 underline">{['privacy','terms','contact'].map(page => <a key={page} href={legalHref(page)}>{legalTitles[page]}</a>)}</nav>
                  {/* Google Sign In */}
                  <div ref={googleSignInRef} className="flex justify-center w-full" aria-label={t('تسجيل الدخول عبر Google')} />
                  {googleAuthState === 'loading' && <p role="status" className="text-center text-sm text-slate-500">{t('جاري تحميل تسجيل الدخول عبر Google...')}</p>}
                  {isSigningIn && <p role="status" className="text-center text-sm text-blue-700">{t('جاري تسجيل الدخول...')}</p>}
                  {googleAuthError && <p role="alert" className="text-sm text-rose-700 bg-rose-50 p-3 rounded-xl">{googleAuthError}</p>}
                  {googleAuthState === 'error' && <button type="button" onClick={() => setGoogleAuthAttempt(n => n + 1)} className="w-full text-sm font-bold py-2 text-blue-700">{t('إعادة المحاولة')}</button>}

                </div>
              </div>
            </div>
          )}

          {/* لوحة تحكم المستخدم (User Dashboard Modal: Saved Materials & Resume) */}
          {showUserDashboard && (
            <div data-study-dialog="account" role="dialog" aria-modal="true" aria-label={t('الحساب')} tabIndex={-1} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-xl font-bold border border-white/20">
                      {currentUser?.avatar ? (
                        <img src={currentUser.avatar} alt="" className="w-full h-full rounded-2xl object-cover" />
                      ) : (
                        currentUser?.name?.[0] || 'U'
                      )}
                    </div>
                    <div>
                      <h3 dir="auto" className="text-lg font-black">{currentUser?.name || t('مستخدم مسجل')}</h3>
                      <p className="text-xs text-blue-100 flex items-center gap-2 mt-0.5">
                        <span dir="auto">{currentUser?.email}</span>
                        <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                          {currentUser?.auth_provider === 'apple' ? 'Apple ID' : 'Google'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <button type="button"
                    aria-label={t('إغلاق')} onClick={() => setShowUserDashboard(false)}
                    className="text-white/80 hover:text-white text-xl w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition cursor-pointer"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>

                {/* Body Content */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
                  {/* Saved Materials and Progress Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-black text-slate-800 text-base flex items-center gap-2">
                        <i className="fa-solid fa-book-bookmark text-indigo-500"></i>
                        {t('موادي واختباراتي المحفوظة في السيرفر')}
                      </h4>
                      <button type="button"
                        onClick={fetchUserMaterials}
                        disabled={isLoadingMaterials}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <i className={`fa-solid fa-arrows-rotate ${isLoadingMaterials ? 'fa-spin' : ''}`}></i>
                        {t('تحديث القائمة')}
                      </button>
                    </div>

                    {isLoadingMaterials ? (
                      <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <i className="fa-solid fa-circle-notch fa-spin text-2xl text-indigo-500 mb-2"></i>
                        <p className="text-xs text-slate-500">{t('جاري تحميل اختباراتك المحفوظة...')}</p>
                      </div>
                    ) : userMaterials.length === 0 ? (
                      <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <i className="fa-solid fa-folder-open text-3xl text-slate-300 mb-2"></i>
                        <p className="text-xs text-slate-500 font-bold">{t('لا توجد مواد أو اختبارات محفوظة بعد')}</p>
                        <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                          {t('عند توليد أي اختبار جديد، سيتم حفظه تلقائياً ويمكنك متابعة المذاكرة من أي جهاز في أي وقت!')}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {userMaterials.map((mat) => {
                          const progressObj = mat.progress;
                          const progressIndex = typeof progressObj?.current_index === 'number'
                            ? progressObj.current_index
                            : (typeof mat.current_index === 'number' ? mat.current_index : null);
                          const isCompleted = (progressObj?.is_completed === 1) || (mat.is_completed === 1);
                          const score = typeof progressObj?.score === 'number'
                            ? progressObj.score
                            : (typeof mat.score === 'number' ? mat.score : 0);
                          const totalCount = mat.question_count || mat.total_questions || 0;
                          const hasStarted = progressIndex !== null && !isNaN(progressIndex);
                          const isQuizMode = (progressObj?.mode === 'quiz' || mat.last_mode === 'quiz');

                          return (
                            <div key={mat.id} className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span dir="auto" className="font-black text-slate-800 text-sm truncate">{mat.title}</span>
                                  <span className="text-[10px] bg-indigo-50 text-indigo-600 font-bold px-2 py-0.5 rounded-full shrink-0">
                                    {totalCount} {t('سؤال')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                                  <span>{new Date(mat.created_at).toLocaleDateString(uiLanguage === 'ar' ? 'ar-EG' : 'en-US')}</span>
                                  {isCompleted ? (
                                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                                      <i className="fa-solid fa-trophy text-amber-500"></i>
                                      {t('مكتمل')} ({score}/{totalCount})
                                    </span>
                                  ) : hasStarted ? (
                                    <span className="text-amber-600 font-bold flex items-center gap-1">
                                      <i className="fa-solid fa-clock-rotate-left"></i>
                                      {t('متوقف عند السؤال')} {progressIndex + 1}
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">{t('لم يبدأ بعد')}</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button type="button"
                                  onClick={() => handleStartStudyMaterial(mat)}
                                  className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                                  title={hasStarted && !isCompleted && !isQuizMode ? t('استئناف المذاكرة') : t('مذاكرة')}
                                >
                                  <i className="fa-solid fa-graduation-cap text-[11px]"></i>
                                  <span>{hasStarted && !isCompleted && !isQuizMode ? t('استئناف المذاكرة') : t('مذاكرة')}</span>
                                </button>
                                <button type="button"
                                  onClick={() => handleResumeQuiz(mat)}
                                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                                  aria-label={hasStarted && !isCompleted && isQuizMode ? t('استئناف الاختبار') : t('بدء الاختبار')} title={hasStarted && !isCompleted && isQuizMode ? t('استئناف الاختبار') : t('بدء الاختبار')}
                                >
                                  <i className="fa-solid fa-play text-[11px]"></i>
                                  <span>{hasStarted && !isCompleted && isQuizMode ? t('استئناف الاختبار') : t('بدء الاختبار')}</span>
                                </button>
                                <button type="button"
                                  onClick={() => handleDeleteMaterial(mat.id)}
                                  className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
                                  aria-label={t('حذف')} title={t('حذف')}
                                >
                                  <i className="fa-solid fa-trash-can text-xs"></i>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
                  <button type="button"
                    onClick={handleLogout}
                    className="text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-right-from-bracket"></i>
                    {t('تسجيل الخروج')}
                  </button>
                  <button type="button"
                    onClick={() => setShowUserDashboard(false)}
                    className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    {t('إغلاق')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* لوحة تحكم المشرف الشاملة (Comprehensive Admin Dashboard) */}
          {showAdminDashboard && <AdminView t={t} fetchAdminAiSettings={fetchAdminAiSettings} handleSaveAiSettings={handleSaveAiSettings} handleTestAiConnection={handleTestAiConnection} fetchAdminVersion={fetchAdminVersion} handleSaveVersion={handleSaveVersion} fetchAdminData={fetchAdminData} handleSaveUserQuota={handleSaveUserQuota} adminDbVersion={adminDbVersion} adminVersionForm={adminVersionForm} setAdminVersionForm={setAdminVersionForm} isSavingVersion={isSavingVersion} versionSaveMsg={versionSaveMsg} setShowAdminDashboard={setShowAdminDashboard} adminQuotaEdits={adminQuotaEdits} setAdminQuotaEdits={setAdminQuotaEdits} savingQuotaUser={savingQuotaUser} adminTab={adminTab} setAdminTab={setAdminTab} adminUsers={adminUsers} adminStats={adminStats} adminAiSettings={adminAiSettings} setAdminAiSettings={setAdminAiSettings} isSavingAiSettings={isSavingAiSettings} aiSettingsSaveMsg={aiSettingsSaveMsg} testingAi={testingAi} aiTestResult={aiTestResult} showBrainKey={showBrainKey} setShowBrainKey={setShowBrainKey} showGeminiKey={showGeminiKey} setShowGeminiKey={setShowGeminiKey} showVertexKey={showVertexKey} setShowVertexKey={setShowVertexKey} />}

                    {legalPage && (
            <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
              <section data-study-dialog="legal" role="dialog" aria-modal="true" aria-labelledby="legal-title" aria-describedby="legal-review-note" tabIndex={-1} dir={uiLanguage === 'ar' ? 'rtl' : 'ltr'} lang={uiLanguage} className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 text-slate-700">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 id="legal-title" className="text-xl font-black text-slate-900">{legalTitles[legalPage]}</h2>
                  <button type="button" aria-label={t('إغلاق')} onClick={() => setLegalPage(null)} className="p-3 rounded-xl hover:bg-slate-100 text-slate-600"><i aria-hidden="true" className="fa-solid fa-xmark"></i></button>
                </div>
                <p id="legal-review-note" className="p-3 mb-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 text-sm leading-relaxed">{uiLanguage === 'ar' ? 'مسودة معلوماتية وليست سياسة قانونية نهائية. يجب مراجعة السياسات وتحديد بيانات المشغّل والجهة القانونية ووسائل التواصل قبل الإطلاق المدفوع.' : 'Informational draft, not a final legal policy. Policies, operator/legal entity details and contact channels require review before a paid launch.'}</p>
                <div className="space-y-4 text-sm leading-relaxed">
                  {legalPage === 'privacy' && <>
                    <p>{uiLanguage === 'ar' ? 'يرسل التطبيق محتوى المصدر وإجاباتك إلى مزوّد الذكاء الاصطناعي المُعدّ على الخادم عند طلب التوليد أو تقييم الإجابة، كما يرسل نصوص النطق إلى مزوّد الصوت المُعدّ. قد يتضمن المصدر صوراً أو نصوص ملفاتك؛ تجنّب رفع معلومات حساسة أو محتوى لا تملك حق استخدامه.' : 'When you request generation or answer evaluation, source content and your answers are sent to the AI provider configured on the server. Text for speech is sent to the configured audio provider. Sources may include images or extracted file text; avoid uploading sensitive information or content you are not entitled to use.'}</p>
                    <p>{uiLanguage === 'ar' ? 'تُحفظ بيانات الحساب والمواد وتقدّم الدراسة في قاعدة بيانات الخادم. يستخدم المتصفح التخزين المحلي وتخزين الجلسة لحفظ رمز الدخول والتفضيلات وحالة الدراسة، بما فيها مادة الزائر المحفوظة سابقاً. حذف تخزين المتصفح قد يفقد المادة المحلية والتقدّم ولا يحذف بيانات الخادم تلقائياً.' : 'Account data, materials and study progress are stored in the server database. Browser local/session storage holds the sign-in token, preferences and study state, including previously saved guest material. Clearing browser storage can lose local material and progress; it does not automatically delete server data.'}</p>
                    <p>{uiLanguage === 'ar' ? 'تبلغ مدة صلاحية ذاكرة الصوت المؤقتة 7 أيام. هذه ليست مدة احتفاظ لبيانات الحساب أو المواد؛ يجب أن يحدد المشغّل مدد الاحتفاظ وطلبات الحذف وبيانات المزوّدين في السياسة النهائية.' : 'The audio cache has a 7-day expiry. This is not a retention period for accounts or materials; the operator must specify retention, deletion requests and provider details in the final policy.'}</p>
                  </>}
                  {legalPage === 'terms' && <>
                    <p>{uiLanguage === 'ar' ? 'التطبيق أداة مساعدة للدراسة وليس بديلاً عن المعلم أو المصدر الدراسي. قد تحتوي الأسئلة والتفسيرات وتقييمات الإجابات والأصوات التي يولّدها المزوّد على أخطاء؛ قارنها بالمصدر قبل اعتمادها.' : 'This is a study aid, not a replacement for a teacher or source material. Provider-generated questions, explanations, answer assessments and audio can contain errors; check them against the source before relying on them.'}</p>
                    <p>{uiLanguage === 'ar' ? 'لا نضمن تحسين الذاكرة أو الحفظ الدائم أو الدرجات أو أي نتيجة دراسية. الأصوات الثنائية والضوضاء الوردية اختيارية وليست علاجاً أو مقياساً لقدرة الذاكرة. التقييم المحلي الاحتياطي تقدير لفظي لتطابق الكلمات، وليس فهماً دلالياً أو نسبة يقين.' : 'No improvement in memory, permanent retention, grades or learning outcome is guaranteed. Binaural audio and pink noise are optional, not a treatment or measurement of memory. Local fallback grading is a lexical word-match estimate, not semantic understanding or a certainty percentage.'}</p>
                    <p>{uiLanguage === 'ar' ? 'توليد مواد جديدة يتطلب تسجيل الدخول وصلاحية ورصيداً متاحاً يحدده الخادم. يمكنك متابعة دراسة مادة الزائر المحفوظة سابقاً على الجهاز. لا تتوفر واجهة دفع في الإصدار الحالي.' : 'New generation requires sign-in, server permission and an available allowance. Previously saved guest material can still be studied on its device. The current interface does not offer payments.'}</p>
                  </>}
                  {legalPage === 'refund' && <>
                    <p>{uiLanguage === 'ar' ? 'الشراء والدفع غير متاحين في الواجهة الحالية، ولا يمكن إنشاء طلب شراء منها. أي أسعار معروضة هي للقراءة فقط وليست عرض دفع قابل للإتمام.' : 'Purchases and payments are unavailable in the current interface; it cannot create a purchase order. Any displayed prices are read-only, not an actionable checkout offer.'}</p>
                    <p>{uiLanguage === 'ar' ? 'لم تُعتمد هنا شروط استرجاع تجارية أو مهل أو ضمانات رد مبالغ. يجب على المشغّل مراجعة ونشر سياسة الاسترجاع والبيانات القانونية قبل قبول مدفوعات. للاستفسار عن عملية سابقة خارج هذه الواجهة، استخدم وسيلة الدعم المُعدّة إن توفرت دون إرسال بيانات البطاقة أو رموز الدخول.' : 'No commercial refund terms, deadlines or repayment guarantees are established here. The operator must review and publish refund terms and legal details before accepting payments. For a previous transaction outside this interface, use the configured support channel if available; do not send card details or sign-in tokens.'}</p>
                  </>}
                  {legalPage === 'contact' && <>
                    <p>{uiLanguage === 'ar' ? 'للمساعدة، اذكر المشكلة ووقت حدوثها وإصدار التطبيق، دون مشاركة كلمة مرور أو رمز دخول أو معلومات دفع أو محتوى دراسي حساس. لا توجد مهلة استجابة مضمونة.' : 'For help, describe the issue, when it occurred and your app version, without sharing passwords, sign-in tokens, payment details or sensitive study content. No response time is guaranteed.'}</p>
                    {supportEmail ? <a href={`mailto:${supportEmail}`} className="inline-block font-bold text-indigo-700 underline break-all" dir="ltr">{supportEmail}</a> : <p className="font-bold text-slate-600">{uiLanguage === 'ar' ? 'لم يُعدّ المشغّل بريد دعم صالحاً عبر الخادم بعد. لا تتوفر حالياً وسيلة دعم مؤكدة في هذه الواجهة.' : 'The operator has not configured a valid support email on the server. No verified support contact is currently available in this interface.'}</p>}
                  </>}
                  {legalPage === 'billing' && <>
                    <p className="font-bold text-slate-900">{uiLanguage === 'ar' ? 'الدفع غير متاح في هذه الواجهة.' : 'Payments are unavailable in this interface.'}</p>
                    <p>{uiLanguage === 'ar' ? 'لا يوجد زر شراء أو إنشاء طلب أو إدخال بيانات دفع. يتطلب تفعيل الدفع التحقق من المسار كاملاً ومراجعة السياسات وبيانات المشغّل أولاً.' : 'There is no purchase button, order creation or payment-data entry. Enabling checkout requires end-to-end verification and review of policies and operator details first.'}</p>
                    <p>{billingInfo ? (billingInfo.paymentEnabled === true ? (uiLanguage === 'ar' ? 'يشير الخادم إلى إعداد الدفع؛ هذا لا يثبت جاهزيته أو اختباره.' : 'The server reports payment configuration; this does not establish readiness or verification.') : (uiLanguage === 'ar' ? 'الدفع معطّل أو غير مكتمل الإعداد على الخادم.' : 'Payments are disabled or not fully configured on the server.')) : (uiLanguage === 'ar' ? 'تعذر تأكيد إعدادات الدفع من الخادم؛ لا تفترض توفر الشراء.' : 'Server billing configuration could not be confirmed; do not assume purchases are available.')}</p>
                    {configuredPacks.length > 0 && <section aria-label={uiLanguage === 'ar' ? 'أسعار مُعدّة للقراءة فقط' : 'Configured read-only prices'} className="space-y-2">
                      <h3 className="font-bold">{uiLanguage === 'ar' ? 'الباقات المُعدّة — للقراءة فقط' : 'Configured packs — read-only'}</h3>
                      <ul className="space-y-2">{configuredPacks.map(pack => <li key={pack.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <span dir="auto" className="font-bold">{(uiLanguage === 'ar' ? pack.titleAr : pack.titleEn) || pack.id}</span>
                        <p>{pack.materials} {uiLanguage === 'ar' ? 'مادة' : 'materials'} · <span dir="ltr">{new Intl.NumberFormat(uiLanguage === 'ar' ? 'ar-SA' : 'en-SA', { style: 'currency', currency: 'SAR' }).format(pack.amountHalalas / 100)}</span></p>
                      </li>)}</ul>
                    </section>}
                    <p>{uiLanguage === 'ar' ? 'التوفر: التوليد الجديد يتطلب تسجيل الدخول وإذن الخادم ورصيد مواد. يمكن متابعة المواد المحفوظة؛ قد تتعذر خدمات الذكاء الاصطناعي والصوت عند تعطل المزوّد أو الاتصال. لا نضمن توفر الخدمة المستمر.' : 'Availability: new generation requires sign-in, server permission and allowance. Saved materials remain studyable; AI and audio services may be unavailable during provider or connection failures. Continuous availability is not guaranteed.'}</p>
                  </>}
                </div>
                <button type="button" onClick={() => setLegalPage(null)} className="mt-6 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold">{t('إغلاق')}</button>
              </section>
            </div>
          )}

          {study.blocked && <section role="alert" className="max-w-xl bg-amber-50 border border-amber-300 rounded-2xl p-4"><p>{t('تغير التقدم في جلسة أخرى. استأنف آخر حفظ من قائمة المواد قبل المتابعة.')}</p><button type="button" onClick={() => { setShowUserDashboard(true); fetchUserMaterials(); }} className="underline p-2">{t('موادي المحفوظة')}</button></section>}
          {/* الكارت الرئيسي للتطبيق */}
          <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden relative flex flex-col min-h-[580px] my-auto">
            
            {/* الشريط العلوي المنسق Header: صفين أنيقين متكاملين */}
            <header className="study-header">
              {/* الصف الأول: العنوان، اسم الطالب، والعداد (Title, Name, and timer) */}
              <div className="study-header-row-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/20 shadow-xs shrink-0">
                    <i className="fa-solid fa-brain text-yellow-300 text-xs sm:text-sm"></i>
                  </div>
                  <span className="study-brand text-white">{t('المولّد الذكي')}</span>
                  {playerName ? (
                    <div className="flex items-center gap-1.5 bg-white/20 px-2.5 py-0.5 sm:py-1 rounded-full text-xs font-bold truncate max-w-[110px] sm:max-w-[150px] border border-white/20 shrink-0" title={t('الطالب: {name}', {name: playerName})}>
                      <i className="fa-solid fa-user-graduate text-amber-300 text-[11px] shrink-0"></i>
                      <span dir="auto" className="truncate">{playerName}</span>
                    </div>
                  ) : (
                    <span className="font-bold text-xs text-white/80 shrink-0">{t('تحدي المذاكرة')}</span>
                  )}
                </div>

                {mode !== 'setup' && mode !== 'upload' && mode !== 'generating' && (
                  <div className="flex items-center gap-1.5 bg-black/25 backdrop-blur-xs px-2.5 py-1 rounded-full border border-white/15 shadow-inner shrink-0">
                    <div className={`font-mono text-xs sm:text-sm font-bold flex items-center gap-1 text-white ${timeLeft <= 60 ? 'text-red-300 animate-pulse' : ''}`} role="timer">
                      <i className="fa-solid fa-stopwatch text-amber-300 text-[11px]"></i>
                      <span dir="ltr" className="tabular-nums font-extrabold">{formatTime(timeLeft)}</span>
                    </div>
                    {['learn','quiz'].includes(mode) && timeLeft > 0 && <button type="button"
                      disabled={study.blocked}
                      onClick={() => study.changeTimer({ running: !timerActive })}
                      aria-label={t(timerActive ? 'إيقاف المؤقت مؤقتاً' : 'استئناف المؤقت')}
                      title={t(timerActive ? 'إيقاف المؤقت مؤقتاً' : 'استئناف المؤقت')}
                      className="p-1.5 rounded-full hover:bg-white/20 disabled:opacity-50">
                      <i aria-hidden="true" className={`fa-solid ${timerActive ? 'fa-pause' : 'fa-play'}`}></i>
                    </button>}
                    {canExtendTimer && (
                      <button type="button"
                        onClick={handleExtendTimer}
                        className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-amber-950 animate-bounce cursor-pointer hover:bg-amber-300 transition shadow-xs mr-0.5"
                        title={t('تمديد 5 دقائق إضافية')}
                        aria-label={t('تمديد 5 دقائق إضافية')}
                      >
                        {t('+5د')}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* الصف الثاني: أيقونات الأدوات والتحكم (tools gear, focus audio, sound effects, narrator, signin/out) */}
              <div className="study-header-row-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* 1. تروس الأدوات والإعدادات (tools gear) */}
                  <button type="button"
                    onClick={() => openHeaderDialog(setShowSettings)} 
                    className="study-icon-btn bg-white/15 hover:bg-white/25 text-white" 
                    title={t('إعدادات الصوت والتركيز')}
                    aria-label={t('إعدادات الصوت والتركيز')}
                  >
                    <i className="fa-solid fa-gear text-xs"></i>
                  </button>

                  {/* 2. صوت التركيز والضوضاء الوردية (focus audio) */}
                  <button type="button"
                    onClick={handleToggleMusic} 
                    aria-pressed={musicEnabled}
                    className={`study-icon-btn study-pill-btn ${
                      musicEnabled 
                        ? 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(52,211,153,0.6)] border-emerald-400' 
                        : 'bg-white/15 text-white/75 hover:bg-white/25 hover:text-white'
                    }`} 
                    title={musicEnabled 
                      ? t('موجات التركيز والضوضاء الوردية نشطة ({wave}). انقر للإيقاف أو خصص من الإعدادات', {wave: uiText(binauralMode === 'gamma' ? 'غاما 40Hz: صوت اختياري' : 'ألفا 10Hz: استرخاء')})
                      : t('تشغيل موجات التركيز العصبية والضوضاء الوردية (Pink Noise)')}
                    aria-label={t('موجات التركيز')}
                  >
                    <i className={`fa-solid ${musicEnabled ? 'fa-wave-square animate-pulse' : 'fa-brain'} text-[11px]`}></i>
                    <span className="text-[11px] font-bold hidden xs:inline sm:inline">{musicEnabled ? (binauralMode === 'gamma' ? '40Hz' : '10Hz') : t('تركيز')}</span>
                  </button>

                  {/* 3. المؤثرات الصوتية (sound effects icon) */}
                  <button type="button"
                    onClick={handleToggleSound} 
                    aria-pressed={soundEnabled}
                    className={`study-icon-btn ${soundEnabled ? 'bg-white/20 text-white' : 'bg-white/10 text-white/40'}`} 
                    title={soundEnabled ? t('المؤثرات الصوتية مفعّلة (انقر لكتم الأصوات)') : t('المؤثرات الصوتية مكتومة')}
                    aria-label={t('المؤثرات الصوتية')}
                  >
                    <i className={`fa-solid ${soundEnabled ? 'fa-volume-high' : 'fa-volume-xmark'} text-xs`}></i>
                  </button>

                  {/* 4. الراوي المساعد الصوتي (narrator icon) */}
                  <button type="button"
                    onClick={handleToggleVoice} 
                    aria-pressed={voiceEnabled}
                    className={`study-icon-btn ${voiceEnabled ? 'bg-amber-400 text-amber-950 font-bold shadow-[0_0_10px_rgba(251,191,36,0.6)] border-amber-300' : 'bg-white/15 text-white/50 hover:bg-white/25'}`} 
                    title={voiceEnabled ? t('المساعد الصوتي مفعّل (انقر للكتم الفوري)') : t('المساعد الصوتي معطل (انقر للتفعيل)')}
                    aria-label={t('المساعد الصوتي')}
                  >
                    <i className="fa-solid fa-headset text-xs"></i>
                  </button>

                  {/* رفع مادة جديدة (عند وجود اختبار نشط) */}
                  {mode !== 'setup' && mode !== 'upload' && mode !== 'generating' && (
                    <button type="button"
                      onClick={handleRequestNewMaterial} 
                      className="study-icon-btn bg-white/15 hover:bg-white/25 text-white/90 hover:text-white" 
                      title={t('رفع مادة أو ملف جديد')}
                      aria-label={t('رفع مادة أو ملف جديد')}
                    >
                      <i className="fa-solid fa-cloud-arrow-up text-xs"></i>
                    </button>
                  )}
                </div>

                {/* الجانب الآخر: تبديل اللغة وتسجيل الدخول / الحساب (signin/out) */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {renderLanguageToggle()}

                  {/* 5. تسجيل الدخول والحساب (signin/out) */}
                  {currentUser ? (
                    <>
                      {currentUser.role === 'admin' && (
                        <button type="button"
                          onClick={() => { openHeaderDialog(setShowAdminDashboard); fetchAdminData(); }}
                          className="px-2.5 py-1 rounded-full text-xs font-black bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-900 shadow-sm hover:scale-105 transition flex items-center gap-1 cursor-pointer shrink-0"
                          title={t('لوحة تحكم المشرف الشاملة')}
                          aria-label={t('لوحة المشرف')}
                        >
                          <i className="fa-solid fa-crown text-[11px] text-amber-950"></i>
                        </button>
                      )}
                      <button type="button"
                        onClick={() => { openHeaderDialog(setShowUserDashboard); fetchUserMaterials(); }}
                        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-full text-xs font-bold text-white border border-white/20 transition cursor-pointer shrink-0"
                        title={t('حسابي وموادي')}
                        aria-label={t('الحساب')}
                      >
                        <i className={`fa-solid ${currentUser.auth_provider === 'apple' ? 'fa-apple' : 'fa-user'} text-[11px]`}></i>
                        <span dir="auto" className="max-w-[75px] truncate hidden sm:inline">{currentUser.name || currentUser.email?.split('@')[0] || t('مستخدم مسجل')}</span>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${canGenerateMaterial ? 'bg-emerald-400 ring-2 ring-emerald-200' : 'bg-amber-300'}`}></span>
                      </button>
                    </>
                  ) : (
                    <button type="button"
                      onClick={() => openHeaderDialog(setShowAuthModal)}
                      className="px-2.5 py-1 rounded-full text-xs font-black bg-white text-indigo-700 hover:bg-indigo-50 shadow-sm transition flex items-center gap-1 cursor-pointer shrink-0"
                      title={t('تسجيل الدخول عبر Google')}
                      aria-label={t('دخول')}
                    >
                      <i className="fa-solid fa-right-to-bracket text-[11px]"></i>
                      <span>{t('دخول')}</span>
                    </button>
                  )}
                </div>
              </div>
            </header>

            {/* إشعار التحديث التلقائي الفوري السحابي */}
            {updateBanner && (
              <div className="mx-4 sm:mx-6 mt-3 p-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 text-white rounded-2xl flex items-center justify-between gap-3 shadow-lg animate-in slide-in-from-top duration-300 z-40">
                <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold">
                  <i className="fa-solid fa-cloud-arrow-down text-lg animate-bounce"></i>
                  <span>{updateBanner.message}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button"
                    onClick={() => { window.location.href = window.location.pathname + '?v=' + Date.now(); }}
                    className="px-3.5 py-1.5 bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs font-black shadow-xs transition cursor-pointer shrink-0 flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-rotate-right"></i>
                    <span>{t('تحديث الآن')}</span>
                  </button>
                  <button type="button"
                    onClick={() => { dismissedUpdateRef.current = releaseKey(updateBanner); setUpdateBanner(null); }}
                    className="text-white/80 hover:text-white p-1 text-sm cursor-pointer"
                    aria-label={t('لاحقاً')} title={t('لاحقاً')}
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              </div>
            )}

            {/* ملصق إعلان الأخطاء والإنذارات البارزة */}
            {errorAnnouncement && (
              <div role="alert" aria-live="assertive" className="fixed top-4 left-4 right-4 mx-auto max-w-2xl p-3 bg-rose-50 border-2 border-rose-300 rounded-2xl flex items-center justify-between gap-3 text-rose-950 text-xs sm:text-sm animate-in fade-in slide-in-from-top-2 duration-200 shadow-md z-[110]">
                <div className="flex items-center gap-2.5 flex-1">
                  <i className="fa-solid fa-triangle-exclamation text-rose-600 text-base shrink-0"></i>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-rose-200 text-rose-900 px-2 py-0.5 rounded-md font-mono font-bold text-[10px] uppercase shrink-0">
                      {t(errorAnnouncement.type)}
                    </span>
                    <span className="font-bold leading-snug">{uiError(errorAnnouncement.message)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button"
                    onClick={() => openHeaderDialog(setShowSettings)}
                    className="text-[11px] underline font-black text-rose-700 hover:text-rose-900 whitespace-nowrap cursor-pointer"
                  >
                    {t('الإعدادات')}
                  </button>
                  <button type="button"
                    onClick={() => setErrorAnnouncement(null)}
                    className="p-1 hover:bg-rose-100 rounded-lg text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
                    aria-label={t('إغلاق التنبيه')} title={t('إغلاق التنبيه')}
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              </div>
            )}

            {errorMsg && mode !== 'upload' && <div role="alert" className="mx-4 sm:mx-6 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-bold flex gap-3 items-center justify-between">
              <span>{uiError(errorMsg)}</span>
              <button type="button" aria-label={t('إغلاق التنبيه')} onClick={() => setErrorMsg('')} className="p-1 shrink-0"><i className="fa-solid fa-xmark"></i></button>
            </div>}

            {/* ملصق إعلانات النظام والإنجازات (اكتمال إعداد المادة ونهاية الأسئلة) */}
            {appAnnouncement && (
              <div className={`mx-4 sm:mx-6 mt-3 p-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs sm:text-sm animate-in fade-in slide-in-from-top-3 duration-300 shadow-lg shrink-0 z-30 ${
                appAnnouncement.type === 'qa_finished' 
                  ? 'bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-500/15 border-2 border-amber-400 text-amber-950' 
                  : 'bg-gradient-to-r from-indigo-500/15 via-blue-500/10 to-purple-500/15 border-2 border-indigo-400 text-indigo-950'
              }`}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                    appAnnouncement.type === 'qa_finished' ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white'
                  }`}>
                    <i className={`fa-solid ${appAnnouncement.icon || 'fa-bell'} text-base`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-black text-sm truncate">{t(appAnnouncement.title)}</span>
                      {appAnnouncement.badge && (
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] shadow-xs ${
                          appAnnouncement.type === 'qa_finished' ? 'bg-amber-200 text-amber-900' : 'bg-indigo-200 text-indigo-900'
                        }`}>
                          {t(appAnnouncement.badge)}
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] opacity-90 leading-relaxed font-medium">{t(appAnnouncement.message)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {appAnnouncement.speechText && renderSpeakerButton(appAnnouncement.speechText, 'bg-white/90 hover:bg-white text-slate-700 shadow-sm border border-slate-200')}
                  <button type="button"
                    onClick={() => setAppAnnouncement(null)}
                    className="p-1.5 hover:bg-black/5 rounded-xl text-slate-400 hover:text-slate-700 font-bold transition cursor-pointer"
                    title={t('إغلاق الإعلان')} aria-label={t('إغلاق الإعلان')}
                  >
                    <i className="fa-solid fa-xmark text-sm"></i>
                  </button>
                </div>
              </div>
            )}

            {/* الحاوية الداخلية المتغيرة */}
            <div className="p-6 sm:p-8 flex-1 flex flex-col justify-center overflow-y-auto">
              
              {/* 1. SETUP MODE */}
              {mode === 'setup' && (
                <div className="text-center space-y-6 my-auto">
                  <div className="w-24 h-24 bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-100 text-white floating-card">
                    <i className="fa-solid fa-graduation-cap text-4xl"></i>
                  </div>
                  <div>
                    <h1 data-study-heading tabIndex={-1} className="text-3xl font-black text-slate-800 mb-2">{t('أهلاً بك في التحدي!')}</h1>
                    <p className="text-slate-500 text-base">{t('حوّل أوراقك وكتبك إلى لعبة تفاعلية بمفاتيح حفظ سحرية')}</p>
                  </div>
                  
                  <form onSubmit={handleNameSubmit} className="space-y-4 max-w-sm mx-auto">
                    <input 
                      type="text" 
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      dir="auto" aria-label={t('اكتب اسمك هنا يا بطل...')} placeholder={t('اكتب اسمك هنا يا بطل...')}
                      className="w-full text-center text-xl p-4 border-2 border-indigo-100 rounded-2xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-50 outline-none transition font-bold text-slate-800"
                    />
                    <button type="submit"
                      className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-4 rounded-2xl font-black text-lg transition-transform active:scale-95 shadow-lg shadow-indigo-200"
                    >
                      {t('بدء المغامرة')} <i className="fa-solid fa-arrow-left"></i>
                    </button>
                  </form>
                </div>
              )}

              {/* 2. UPLOAD MODE */}
              {mode === 'upload' && <UploadView t={t} uiError={uiError} canGenerateMaterial={canGenerateMaterial} isAllowanceExhausted={isAllowanceExhausted} openHeaderDialog={openHeaderDialog} fileInputRef={fileInputRef} formatFileSize={formatFileSize} handleFilesSelected={handleFilesSelected} handleRemoveFile={handleRemoveFile} handleClearAllFiles={handleClearAllFiles} handleProcessAllFiles={handleProcessAllFiles} handleTextSubmit={handleTextSubmit} loadDemoQuestions={loadDemoQuestions} resumeGuestMaterial={resumeGuestMaterial} renderAllowanceExhaustedOverlay={renderAllowanceExhaustedOverlay} uiLanguage={uiLanguage} playerName={playerName} errorMsg={errorMsg} authToken={authToken} setShowAuthModal={setShowAuthModal} guestSavedMaterial={guestSavedMaterial} textInput={textInput} setTextInput={setTextInput} uploadTab={uploadTab} setUploadTab={setUploadTab} selectedFiles={selectedFiles} isProcessingFiles={isProcessingFiles} isDragging={isDragging} setIsDragging={setIsDragging} />}

                        {/* 3. GENERATING MODE */}
              {mode === 'generating' && (
                <div className="text-center space-y-8 my-auto">
                  <div className="relative w-28 h-28 mx-auto">
                    <div className="absolute inset-0 bg-indigo-200 rounded-full animate-ping opacity-60"></div>
                    <div className="absolute inset-0 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-full flex items-center justify-center shadow-xl text-white">
                      {generationStatus === 'drafting' ? (
                        <i className="fa-solid fa-wand-magic-sparkles text-4xl animate-pulse"></i>
                      ) : (
                        <i className="fa-solid fa-magnifying-glass-chart text-4xl animate-bounce"></i>
                      )}
                    </div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 mb-2">
                      {generationStatus === 'drafting' 
                        ? t('الرجاء الانتظار لبضع دقائق، انا اقرأ المادة الذكية... ✨')
                        : t('الرجاء الانتظار لبضع دقائق، انا المفتش الصارم ... 🕵️♂️')}
                    </h2>
                    <p className="text-slate-500 font-bold text-sm animate-pulse">
                      {generationStatus === 'drafting' 
                        ? t('أقترح مفاتيح حفظ من محتوى الملف؛ تحقق من دقتها.')
                        : t('أراجع الأسئلة للتحقق من دقتها؛ قد تبقى أخطاء.')}
                    </p>
                  </div>
                </div>
              )}

              {/* 4. INTRO MODE */}
              {mode === 'intro' && (
                <div className="text-center space-y-6 my-auto">
                  <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-md">
                    <i className="fa-solid fa-trophy text-3xl"></i>
                  </div>
                  <div>
                    <h1 data-study-heading tabIndex={-1} className="text-3xl font-black text-slate-800">{t('تم تجهيز التحدي! 🚀')}</h1>
                    <p className="text-slate-600 text-base mt-2">
                      {t('استخرجنا')} <span className="font-extrabold text-indigo-600 text-lg">{questionsData.length} {t('كبسولة ذاكرة ذكية')}</span> {t('مع روابط بصرية ومفاتيح حفظ سحرية. كيف تود البدء؟')}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
                      {questionsData.some(q => isFillBlankQuestion(q)) && (
                        <span className="inline-flex items-center gap-1 bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-bold px-2.5 py-1 rounded-full">
                          <i className="fa-solid fa-wand-magic"></i> {t('إكمال الفراغ والتوليد النشط')}
                        </span>
                      )}
                      {questionsData.some(q => isShortAnswerQuestion(q)) && (
                        <span className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-bold px-2.5 py-1 rounded-full">
                          <i className="fa-solid fa-pen-nib"></i> {t('أسئلة مقالية بالذكاء الاصطناعي')}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 bg-purple-50 border border-purple-200 text-purple-800 text-[11px] font-bold px-2.5 py-1 rounded-full">
                        <i className="fa-solid fa-brain"></i> {t('ترميز بصري + موجات غاما')}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-3 max-w-sm mx-auto pt-2">
                    <button type="button"
                      onClick={startLearning}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-bold text-lg transition-transform active:scale-95 shadow-lg shadow-indigo-100"
                    >
                      <i className="fa-solid fa-key text-yellow-300"></i> {t('مرحلة الفهم (أسرار الحفظ)')}
                    </button>
                    <button type="button"
                      onClick={startQuiz}
                      className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-2xl font-bold text-lg transition-transform active:scale-95 shadow-lg shadow-emerald-100"
                    >
                      <i className="fa-solid fa-play"></i> {t('بدء الاختبار فوراً')}
                    </button>
                  </div>
                </div>
              )}

              {/* 5. LEARN MODE: منظومة علوم الذاكرة العصبية والاسترجاع النشط الخفي */}
              {mode === 'learn' && questionsData.length > 0 && <LearnView navigateLearn={navigateLearn} t={t} saveProgressToDb={saveProgressToDb} speak={speak} renderSpeakerButton={renderSpeakerButton} handleStartOverStudy={handleStartOverStudy} startQuiz={startQuiz} handleMarkCardMastered={handleMarkCardMastered} handleMarkCardNeedsReview={handleMarkCardNeedsReview} questionsData={questionsData} currentIndex={currentIndex} setCurrentIndex={setCurrentIndex} showHint={showHint} setShowHint={setShowHint} score={score} soundEnabled={soundEnabled} isAnswerRevealed={isAnswerRevealed} setIsAnswerRevealed={setIsAnswerRevealed} setShowWhy={setShowWhy} authToken={authToken} currentMaterialId={currentMaterialId} />}

                        {/* 6. QUIZ MODE */}
              {mode === 'quiz' && shuffledQuestions.length > 0 && <QuizView t={t} speak={speak} renderSpeakerButton={renderSpeakerButton} openQuizMemory={openQuizMemory} handleStartOverQuiz={handleStartOverQuiz} startLearning={startLearning} handleAnswerClick={handleAnswerClick} handleFillBlankClick={handleFillBlankClick} handleShortAnswerSubmit={handleShortAnswerSubmit} handleNextQuestion={handleNextQuestion} toggleVoiceInput={toggleVoiceInput} uiLanguage={uiLanguage} currentIndex={currentIndex} score={score} shuffledQuestions={shuffledQuestions} selectedAnswer={selectedAnswer} isAnswerChecked={isAnswerChecked} studentShortAnswer={studentShortAnswer} setStudentShortAnswer={setStudentShortAnswer} isEvaluatingShortAnswer={isEvaluatingShortAnswer} shortAnswerEvaluation={shortAnswerEvaluation} isListeningSpeech={isListeningSpeech} consecutiveStreak={consecutiveStreak} fillBlankSelected={fillBlankSelected} />}

                        {/* 7. RESULT MODE */}
              {mode === 'result' && <ResultView beginRun={beginRun} t={t} speak={speak} renderSpeakerButton={renderSpeakerButton} getFinishSpeechText={getFinishSpeechText} handleRequestNewMaterial={handleRequestNewMaterial} setMode={setMode} playerName={playerName} questionsData={questionsData} setQuestionsData={setQuestionsData} setCurrentIndex={setCurrentIndex} setShowHint={setShowHint} score={score} setScore={setScore} shuffledQuestions={shuffledQuestions} setShuffledQuestions={setShuffledQuestions} setSelectedAnswer={setSelectedAnswer} setIsAnswerChecked={setIsAnswerChecked} setStudentShortAnswer={setStudentShortAnswer} setIsEvaluatingShortAnswer={setIsEvaluatingShortAnswer} setShortAnswerEvaluation={setShortAnswerEvaluation} timeLeft={timeLeft} setTimeLeft={setTimeLeft} setTimerActive={setTimerActive} soundEnabled={soundEnabled} allOriginalQuestions={allOriginalQuestions} wrongQuestions={wrongQuestions} setWrongQuestions={setWrongQuestions} />}

          
            </div>
          </div>

          {/* Footer مع شارة الإصدار ومحرك الصوت وفحص التحديث الفوري */}
          <footer className="mt-4 mb-2 flex flex-col sm:flex-row items-center justify-center gap-3 text-xs text-slate-500 font-medium">
            <span>{uiLanguage === 'ar' ? 'المولّد الذكي للاختبارات • أداة دراسة بالذكاء الاصطناعي؛ قد تخطئ النتائج.' : 'Smart Quiz Generator • AI study aid; results may contain errors.'}</span>
            <nav aria-label={uiLanguage === 'ar' ? 'السياسات والدعم والتوفر' : 'Policies, support and availability'} className="flex flex-wrap items-center justify-center gap-2">
              {['privacy', 'terms', 'refund', 'contact', 'billing'].map(page => ['privacy','terms','contact'].includes(page) ? <a key={page} href={legalHref(page)} className="px-2 py-2 rounded-lg underline hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2">{legalTitles[page]}</a> : <button type="button" key={page} onClick={() => openLegalPage(page)} className="px-2 py-2 rounded-lg underline hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600">{legalTitles[page]}</button>)}
            </nav>
            <button type="button"
              onClick={() => checkAppVersion(true)}
              title={t('فحص تحديثات التطبيق وصوت الذكاء الاصطناعي')}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-800 rounded-full text-[11px] font-bold transition shadow-xs cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>v{APP_CLIENT_VERSION}</span>
              <span className="text-slate-300">•</span>
              <span className="text-indigo-600 font-black">🎙️ {t('صوت AI حصراً')}</span>
              {checkingVersion ? <i className="fa-solid fa-spinner fa-spin text-[10px]"></i> : <i className="fa-solid fa-rotate text-[10px] text-slate-400"></i>}
            </button>
          </footer>
        </div>
      );
    }

