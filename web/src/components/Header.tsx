import React, { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n';
import { getGuestQuizzesRemainingToday } from '../guest/guestStorage';
import {
  startAmbientMusic,
  stopAmbientMusic,
  isAmbientPlaying
} from '../audio/audioEngine';

interface HeaderProps {
  onOpenLibrary: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  onNewQuiz: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenLibrary,
  onOpenSettings,
  onOpenAdmin,
  onNewQuiz
}) => {
  const { user, isAuthenticated, isAdmin, openAuthModal, logout } = useAuth();
  const { t, lang, toggleLang, isRtl } = useI18n();
  const [isPlayingSound, setIsPlayingSound] = useState(false);
  const [soundMode, setSoundMode] = useState<'gamma' | 'alpha'>('gamma');
  const [showUserMenu, setShowUserMenu] = useState(false);

  const guestRemaining = getGuestQuizzesRemainingToday();

  const toggleSound = () => {
    if (isPlayingSound) {
      stopAmbientMusic();
      setIsPlayingSound(false);
    } else {
      startAmbientMusic(soundMode);
      setIsPlayingSound(true);
    }
  };

  const switchSoundMode = (mode: 'gamma' | 'alpha') => {
    setSoundMode(mode);
    if (isPlayingSound) {
      startAmbientMusic(mode);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100 shadow-sm transition">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Logo and Brand */}
        <div
          onClick={onNewQuiz}
          className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group select-none shrink-0"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center text-lg sm:text-xl shadow-md shadow-indigo-200 group-hover:scale-105 transition">
            🧠
          </div>
          <div>
            <h1 className="font-black text-slate-800 text-sm sm:text-base md:text-lg leading-tight flex items-center gap-1.5">
              <span>{t.common.appName}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                {t.common.version}
              </span>
            </h1>
            <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium hidden sm:block">
              {t.common.appTagline}
            </p>
          </div>
        </div>

        {/* Ambient Neuro-Acoustic Sound Bar */}
        <div className="hidden sm:flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-2xl p-1 shadow-inner">
          <button
            onClick={toggleSound}
            title={isPlayingSound ? t.header.ambientMute : t.header.ambientFocus}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
              isPlayingSound
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <span>{isPlayingSound ? '🔊' : '🔇'}</span>
            <span className="hidden md:inline">
              {isPlayingSound ? t.header.ambientActive : t.header.ambientFocus}
            </span>
          </button>

          {isPlayingSound && (
            <div className="flex items-center gap-1 px-1 text-[11px] font-semibold">
              <button
                onClick={() => switchSoundMode('gamma')}
                className={`px-1.5 py-0.5 rounded-lg transition ${
                  soundMode === 'gamma'
                    ? 'bg-indigo-100 text-indigo-700 font-bold'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
                title={t.header.gammaDesc}
              >
                {t.header.gammaLabel}
              </button>
              <button
                onClick={() => switchSoundMode('alpha')}
                className={`px-1.5 py-0.5 rounded-lg transition ${
                  soundMode === 'alpha'
                    ? 'bg-indigo-100 text-indigo-700 font-bold'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
                title={t.header.alphaDesc}
              >
                {t.header.alphaLabel}
              </button>
            </div>
          )}
        </div>

        {/* Actions Bar: Language Toggle + User Account / Sign In */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Language Toggle Button */}
          <button
            onClick={toggleLang}
            title={lang === 'ar' ? 'Switch to English' : 'التحويل إلى اللغة العربية'}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-slate-700 font-bold text-xs transition cursor-pointer shadow-2xs"
          >
            <span className="text-sm">🌐</span>
            <span className="font-extrabold">{t.header.switchLang}</span>
          </button>

          {isAuthenticated && user ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1.5 sm:gap-2 py-1 sm:py-1.5 px-2 sm:px-3 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition cursor-pointer"
              >
                {/* Allowance Badge */}
                <span className="text-[11px] sm:text-xs font-extrabold px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                  {user.plan === 'unlimited' ? t.header.unlimited : `${user.remainingToday}/${user.dailyLimit} ${t.header.todayAllowance}`}
                </span>

                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                    {user.name.slice(0, 1)}
                  </div>
                )}
                <span className="text-xs font-bold text-slate-700 hidden sm:inline max-w-[90px] truncate">
                  {user.name}
                </span>
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className={`absolute ${isRtl ? 'left-0' : 'right-0'} mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-40 animate-in fade-in zoom-in-95 duration-150`}>
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-xs font-bold text-slate-800 truncate">{user.name}</p>
                      <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                    </div>

                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onOpenLibrary();
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                    >
                      <span>📚</span>
                      <span>{t.header.myLibrary}</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onOpenSettings();
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                    >
                      <span>⚙️</span>
                      <span>{t.header.settings}</span>
                    </button>

                    {isAdmin && (
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          onOpenAdmin();
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50 transition cursor-pointer border-t border-slate-100"
                      >
                        <span>👑</span>
                        <span>{t.header.adminDashboard}</span>
                      </button>
                    )}

                    <div className="border-t border-slate-100 my-1" />

                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    >
                      <span>🚪</span>
                      <span>{t.header.logout}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="hidden md:inline text-xs font-medium text-slate-500 whitespace-nowrap">
                {guestRemaining > 0 ? `${guestRemaining} ${t.header.guestFreeLeft}` : t.header.guestFreeExpired}
              </span>
              <button
                onClick={() => openAuthModal()}
                className="flex items-center gap-1.5 py-1.5 px-3 sm:px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition cursor-pointer whitespace-nowrap"
              >
                <span>{t.header.login}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
