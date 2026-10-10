import React, { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthProvider';
import { useI18n } from '../i18n';
import { PublicConfigResponse, NonceResponse } from '@fast-learning/shared';

interface Props {
  onSuccess?: () => void;
  isLinking?: boolean;
}

export const AppleSignInButton: React.FC<Props> = ({ onSuccess, isLinking }) => {
  const { loginWithApple, linkApple } = useAuth();
  const { isRtl } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);

    try {
      const config = await api.get<PublicConfigResponse>('/config');
      if (!config.appleClientId) {
        throw new Error('خدمة Apple Sign-in غير مهيأة بعد');
      }

      const { nonce } = await api.get<NonceResponse>('/auth/nonce');

      const AppleID = (window as any).AppleID;
      if (!AppleID?.auth) {
        throw new Error('جاري تحميل مكتبة Apple، يرجى المحاولة بعد لحظات');
      }

      AppleID.auth.init({
        clientId: config.appleClientId,
        scope: 'name email',
        redirectURI: window.location.origin + '/fast-learning/',
        usePopup: true,
        nonce
      });

      const data = await AppleID.auth.signIn();
      const idToken = data.authorization?.id_token;
      if (!idToken) {
        throw new Error('لم يتم استلام رمز التحقق من Apple');
      }

      let fullName = '';
      if (data.user?.name) {
        fullName = `${data.user.name.firstName || ''} ${data.user.name.lastName || ''}`.trim();
      }

      if (isLinking) {
        await linkApple(idToken, fullName);
      } else {
        await loginWithApple(idToken, fullName);
      }

      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || 'فشل تسجيل الدخول بحساب Apple');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center w-full my-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full max-w-[320px] h-[44px] flex items-center justify-center gap-3 bg-black hover:bg-slate-900 active:scale-[0.99] text-white font-bold rounded-full transition shadow-md cursor-pointer disabled:opacity-50"
      >
        <svg className="w-5 h-5 fill-current" viewBox="0 0 170 170">
          <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.59-7.71-11.66-14-4.88-7.5-8.8-16.19-11.75-26.07-2.95-9.87-4.43-19.5-4.43-28.87 0-14.78 3.7-26.97 11.1-36.56 7.4-9.59 16.7-14.43 27.9-14.54 5.33 0 11.09 1.41 17.27 4.24 6.18 2.83 10.12 4.3 11.83 4.41 1.42 0 5.6-1.58 12.56-4.75 6.95-3.16 12.82-4.59 17.6-4.29 13.04.88 23.4 5.76 31.08 14.65-11.51 6.96-17.16 16.63-16.94 29 0 9.8 3.7 18.15 11.1 25.03 7.4 6.88 16.19 10.74 26.37 11.59-2.07 6.42-4.68 13.06-7.83 19.92zM119.22 31.85c0-7.39 2.66-14.35 7.99-20.87 5.33-6.52 11.96-10.43 19.89-11.74.87 7.07-1.31 14.02-6.52 20.87-5.22 6.85-11.96 10.76-20.22 11.74-.22-1.3-.57-2.6-.57-3.89l-.57 3.89z"/>
        </svg>
        <span className="text-sm">
          {loading
            ? (isRtl ? 'جاري التحقق...' : 'Verifying...')
            : isLinking
              ? (isRtl ? 'ربط حساب Apple ID' : 'Link Apple ID')
              : (isRtl ? 'تسجيل الدخول عبر Apple ID' : 'Sign in with Apple')}
        </span>
      </button>
      {error && <div className="text-xs text-rose-500 mt-2 text-center">{error}</div>}
    </div>
  );
};
