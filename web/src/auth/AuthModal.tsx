import React from 'react';
import { useAuth } from './AuthProvider';
import { useI18n } from '../i18n';
import { GoogleSignInButton } from './GoogleSignInButton';
import { AppleSignInButton } from './AppleSignInButton';

export const AuthModal: React.FC = () => {
  const { showAuthModal, authModalMessage, closeAuthModal } = useAuth();
  const { t, isRtl } = useI18n();

  if (!showAuthModal) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 relative border border-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={closeAuthModal}
          className={`absolute top-4 ${isRtl ? 'left-4' : 'right-4'} w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner text-2xl">
            🧠
          </div>
          <h3 className="text-xl font-black text-slate-800">{t.authModal.title}</h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-2 leading-relaxed">
            {authModalMessage || t.authModal.subtitle}
          </p>

          <div className="mt-4 p-3 rounded-2xl bg-slate-50 border border-slate-100 text-start text-xs space-y-1.5 text-slate-600">
            <div>{t.authModal.benefit1}</div>
            <div>{t.authModal.benefit2}</div>
            <div>{t.authModal.benefit3}</div>
          </div>
        </div>

        <div className="space-y-3 flex flex-col items-center">
          <GoogleSignInButton onSuccess={closeAuthModal} />
          <AppleSignInButton onSuccess={closeAuthModal} />
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400">
            {t.authModal.privacyNotice}
          </p>
        </div>
      </div>
    </div>
  );
};
