import React, { useEffect, useState } from 'react';
import { Material, QuizAttempt } from '@fast-learning/shared';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';
import { getGuestSavedMaterials } from '../../guest/guestStorage';

interface LibraryViewProps {
  onSelectMaterial: (material: Material, resumeAttempt?: QuizAttempt | null) => void;
  onClose: () => void;
  onNewQuiz: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  onSelectMaterial,
  onClose,
  onNewQuiz
}) => {
  const { isAuthenticated } = useAuth();
  const { t, isRtl } = useI18n();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMaterials = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isAuthenticated) {
        const data = await api.get<Material[]>('/materials');
        setMaterials(data);
      } else {
        const guestData = getGuestSavedMaterials();
        setMaterials(guestData);
      }
    } catch (err: any) {
      setError(err.message || t.common.error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterials();
  }, [isAuthenticated]);

  const handleDelete = async (id: number) => {
    if (!confirm(t.library.deletePrompt)) return;
    try {
      if (isAuthenticated) {
        await api.del(`/materials/${id}`);
      }
      setMaterials(materials.filter(m => m.id !== id));
    } catch (err: any) {
      alert(t.common.error + ': ' + err.message);
    }
  };

  const handleOpen = async (material: Material, resume: boolean) => {
    try {
      let fullMaterial = material;
      if (!material.questions || material.questions.length === 0) {
        fullMaterial = await api.get<Material>(`/materials/${material.id}`);
      }

      onSelectMaterial(fullMaterial, resume ? material.latestAttempt : null);
      onClose();
    } catch (err: any) {
      alert(t.common.error + ': ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-slate-100">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl font-bold">
              📚
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800">{t.library.title}</h3>
              <p className="text-xs text-slate-400">
                {isAuthenticated
                  ? t.library.subtitleCloud
                  : t.library.subtitleLocal}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">{t.common.loading}</div>
          ) : error ? (
            <div className="p-4 bg-rose-50 text-rose-700 text-xs font-semibold rounded-2xl">
              {error}
            </div>
          ) : materials.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="text-4xl">📂</div>
              <p className="text-sm font-bold text-slate-700">{t.library.emptyTitle}</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {t.library.emptyDesc}
              </p>
              <button
                onClick={() => {
                  onClose();
                  onNewQuiz();
                }}
                className="mt-2 py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition cursor-pointer"
              >
                {t.library.generateNewQuiz}
              </button>
            </div>
          ) : (
            materials.map(m => {
              const attempt = m.latestAttempt;
              const hasProgress = attempt && attempt.status === 'in_progress';

              return (
                <div
                  key={m.id}
                  className="p-4 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-slate-800 leading-snug">{m.title}</h4>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span>📝 {m.question_count} {t.library.questionsCount}</span>
                      <span>•</span>
                      <span>📅 {new Date(m.created_at).toLocaleDateString(isRtl ? 'ar-EG' : 'en-US')}</span>
                      {hasProgress && (
                        <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          {t.library.continueQuiz} ({attempt.current_index + 1})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {hasProgress ? (
                      <button
                        onClick={() => handleOpen(m, true)}
                        className="flex-1 sm:flex-none py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                      >
                        {t.library.continueQuiz} ({attempt.current_index + 1}/{m.question_count}) ⏩
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpen(m, false)}
                        className="flex-1 sm:flex-none py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                      >
                        {t.library.startFromStart} 🎯
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(m.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                      title={t.common.delete}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
