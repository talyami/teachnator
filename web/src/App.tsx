import React, { useState } from 'react';
import { Material, Question, QuizAttempt } from '@fast-learning/shared';
import { useAuth } from './auth/AuthProvider';
import { I18nProvider, useI18n } from './i18n';
import { Header } from './components/Header';
import { CreateQuiz } from './features/create/CreateQuiz';
import { StudyView } from './features/study/StudyView';
import { LibraryView } from './features/library/LibraryView';
import { SettingsModal } from './features/settings/SettingsModal';
import { AdminDashboard } from './features/admin/AdminDashboard';
import { AuthModal } from './auth/AuthModal';
import { getGuestUsageToday } from './guest/guestStorage';
import { GUEST_MAX_QUIZZES_PER_DAY } from './config/limits';

export const AppContent: React.FC = () => {
  const { user, isAuthenticated, openAuthModal } = useAuth();
  const { t, isRtl } = useI18n();

  // Active study state
  const [activeMaterial, setActiveMaterial] = useState<Material | null>(null);
  const [resumeAttempt, setResumeAttempt] = useState<QuizAttempt | null>(null);

  // Modals state
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  // Guest usage
  const guestUsage = !isAuthenticated ? getGuestUsageToday() : null;
  const remainingGuestQuizzes = guestUsage ? Math.max(0, GUEST_MAX_QUIZZES_PER_DAY - guestUsage.quizzesGenerated) : 0;

  const handleQuizReady = (material: Material, questions: Question[]) => {
    setActiveMaterial({
      ...material,
      questions
    });
    setResumeAttempt(null);
  };

  const handleSelectMaterial = (material: Material, attempt?: QuizAttempt | null) => {
    setActiveMaterial(material);
    setResumeAttempt(attempt || null);
    setIsLibraryOpen(false);
  };

  return (
    <div className={`min-h-screen bg-slate-50 flex flex-col ${isRtl ? 'font-cairo' : 'font-sans'}`}>
      {/* Header */}
      <Header
        onOpenLibrary={() => setIsLibraryOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAdmin={() => setIsAdminOpen(true)}
        onNewQuiz={() => {
          setActiveMaterial(null);
          setResumeAttempt(null);
        }}
      />

      {/* Guest Banner */}
      {!isAuthenticated && (
        <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 text-white text-xs py-2 px-4 shadow-sm text-center flex items-center justify-center gap-2 flex-wrap">
          <span>
            🌟 {t.guestBanner.browsingAsGuest.replace('{count}', String(remainingGuestQuizzes))}
          </span>
          <button
            onClick={() => openAuthModal()}
            className="underline font-bold hover:text-indigo-100 transition cursor-pointer"
          >
            {t.guestBanner.signInPrompt}
          </button>
        </div>
      )}

      {/* Main Body */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeMaterial ? (
          <StudyView
            material={activeMaterial}
            questions={activeMaterial.questions || []}
            initialAttempt={resumeAttempt}
            onExit={() => {
              setActiveMaterial(null);
              setResumeAttempt(null);
            }}
          />
        ) : (
          <CreateQuiz
            onQuizReady={handleQuizReady}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-slate-200/60 bg-white/50 text-center text-xs text-slate-400">
        <p>{t.footer.copyright}</p>
      </footer>

      {/* Modals */}
      <AuthModal />

      {isLibraryOpen && (
        <LibraryView
          onSelectMaterial={handleSelectMaterial}
          onClose={() => setIsLibraryOpen(false)}
          onNewQuiz={() => {
            setIsLibraryOpen(false);
            setActiveMaterial(null);
          }}
        />
      )}

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {isAdminOpen && user?.role === 'admin' && (
        <AdminDashboard onClose={() => setIsAdminOpen(false)} />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
};

export default App;
