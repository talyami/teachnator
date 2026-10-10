import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';
import { generateQuizAI, isUsingOwnKey } from '../../ai/aiClient';
import { LIMITS } from '../../config/limits';
import { Material, Question } from '@fast-learning/shared';
import mammoth from 'mammoth';

interface CreateQuizProps {
  onQuizReady: (material: Material, questions: Question[]) => void;
  onOpenSettings: () => void;
}

export const CreateQuiz: React.FC<CreateQuizProps> = ({ onQuizReady, onOpenSettings }) => {
  const { user, isAuthenticated, openAuthModal } = useAuth();
  const { t, isRtl } = useI18n();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [materialLanguage, setMaterialLanguage] = useState<'auto' | 'ar' | 'en'>('auto');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');

  const usingOwnKey = isUsingOwnKey();
  const maxQuestions = isAuthenticated ? LIMITS.signedIn.free.maxQuestionsPerQuiz : LIMITS.guest.maxQuestionsPerQuiz;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setFileName(file.name);
    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }

    try {
      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const res = await mammoth.extractRawText({ arrayBuffer });
        setContent(res.value);
      } else if (file.name.endsWith('.txt') || file.type.includes('text')) {
        const text = await file.text();
        setContent(text);
      } else {
        const text = await file.text();
        setContent(text);
      }
    } catch (err: any) {
      setError(t.common.error + ': ' + err.message);
    }
  };

  const handleGenerate = async () => {
    if (!content.trim() || content.trim().length < 15) {
      setError(t.createQuiz.validationShortText);
      return;
    }

    setLoading(true);
    setError(null);
    setLoadingStep(t.createQuiz.step1);

    try {
      setTimeout(() => setLoadingStep(t.createQuiz.step2), 1200);
      setTimeout(() => setLoadingStep(t.createQuiz.step3), 2600);

      const generated = await generateQuizAI(
        {
          title: title.trim() || (isRtl ? 'اختبار تفاعلي جديد' : 'New Interactive Quiz'),
          text: content.trim(),
          questionCount,
          difficulty,
          model,
          language: materialLanguage,
          sourceName: fileName || (isRtl ? 'نص مباشر' : 'Direct Text'),
          sourceType: fileName ? 'file' : 'text'
        },
        isAuthenticated,
        () => openAuthModal(t.guestBanner.signInPrompt)
      );

      const dummyMaterial: Material = {
        id: Date.now(),
        user_id: user?.id || 0,
        title: generated.title || title || (isRtl ? 'اختبار تفاعلي' : 'Interactive Quiz'),
        source_type: fileName ? 'file' : 'text',
        source_name: fileName || '',
        content_preview: content.slice(0, 150),
        questions: generated.questions,
        question_count: generated.questions.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null
      };

      onQuizReady(dummyMaterial, generated.questions);
    } catch (err: any) {
      setError(err.message || t.common.error);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 animate-in fade-in duration-300">
      {/* Hero Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold mb-3">
          <span>{t.createQuiz.badge}</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-800 leading-tight">
          {t.createQuiz.title}
        </h2>
        <p className="text-slate-500 text-xs sm:text-sm mt-2 max-w-lg mx-auto">
          {t.createQuiz.subtitle}
        </p>

        {usingOwnKey && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
            <span>🔑</span>
            <span>{t.createQuiz.usingPersonalKeyNotice}</span>
          </div>
        )}
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 sm:p-8 space-y-6">
        {/* Title Input */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            {t.createQuiz.titleInputLabel}
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t.createQuiz.titlePlaceholder}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm font-medium outline-none transition"
          />
        </div>

        {/* Content Input & File Upload */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700">
              {t.createQuiz.contentInputLabel}
            </label>
            <label className="text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer flex items-center gap-1">
              <span>📎</span>
              <span>{t.createQuiz.tabFile}</span>
              <input
                type="file"
                accept=".docx,.txt,.doc"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {fileName && (
            <div className="flex items-center justify-between bg-indigo-50/70 border border-indigo-100 px-3 py-1.5 rounded-xl text-xs text-indigo-800 font-semibold mb-2">
              <span className="truncate">📄 {t.createQuiz.selectedFile} {fileName}</span>
              <button
                onClick={() => {
                  setFileName('');
                  setContent('');
                }}
                className="text-indigo-500 hover:text-indigo-800 font-bold cursor-pointer"
                title={t.createQuiz.removeFile}
              >
                ✕
              </button>
            </div>
          )}

          <textarea
            rows={7}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={t.createQuiz.contentPlaceholder}
            className="w-full p-4 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm font-medium outline-none transition resize-y leading-relaxed"
          />
          <div className="flex justify-between text-[11px] text-slate-400 mt-1">
            <span>{isRtl ? 'الحد الأدنى 15 حرفاً' : 'Minimum 15 characters'}</span>
            <span>{content.length.toLocaleString(isRtl ? 'ar-EG' : 'en-US')} {isRtl ? 'حرف' : 'chars'}</span>
          </div>
        </div>

        {/* Settings Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
          {/* Question Count */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-slate-700">{t.createQuiz.questionCountLabel}</label>
              <span className="text-xs font-black text-indigo-600">{questionCount}</span>
            </div>
            <input
              type="range"
              min={3}
              max={maxQuestions}
              value={questionCount}
              onChange={e => setQuestionCount(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>3</span>
              <span>{maxQuestions}</span>
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">{t.createQuiz.difficultyLabel}</label>
            <div className="grid grid-cols-3 gap-1">
              {[
                { id: 'easy', label: t.createQuiz.diffEasy },
                { id: 'medium', label: t.createQuiz.diffMedium },
                { id: 'hard', label: t.createQuiz.diffHard }
              ].map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDifficulty(d.id as any)}
                  className={`py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    difficulty === d.id
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Material Language Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">{t.createQuiz.materialLangLabel}</label>
            <select
              value={materialLanguage}
              onChange={e => setMaterialLanguage(e.target.value as any)}
              className="w-full py-1.5 px-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 outline-none bg-white cursor-pointer focus:border-indigo-500"
            >
              <option value="auto">{t.createQuiz.langAuto}</option>
              <option value="ar">{t.createQuiz.langAr}</option>
              <option value="en">{t.createQuiz.langEn}</option>
            </select>
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">{t.createQuiz.modelLabel}</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full py-1.5 px-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 outline-none bg-white cursor-pointer focus:border-indigo-500"
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash ⚡</option>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
              <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
              <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
            </select>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-between gap-2">
            <span>⚠️ {error}</span>
            {error.includes('رصيدك') && (
              <button
                onClick={onOpenSettings}
                className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-700 transition shrink-0 cursor-pointer"
              >
                {t.settings.byokTitle}
              </button>
            )}
          </div>
        )}

        {/* Action Button */}
        <div>
          <button
            onClick={handleGenerate}
            disabled={loading || !content.trim()}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-600 hover:opacity-95 active:scale-[0.99] text-white font-black text-sm sm:text-base shadow-lg shadow-indigo-200 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>{loadingStep || t.createQuiz.generating}</span>
              </div>
            ) : (
              <>
                <span>{t.createQuiz.generateBtn}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
