import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthProvider';
import { useI18n } from '../i18n';
import { PublicConfigResponse, NonceResponse } from '@fast-learning/shared';

interface Props {
  onSuccess?: () => void;
  isLinking?: boolean;
}

export const GoogleSignInButton: React.FC<Props> = ({ onSuccess, isLinking }) => {
  const buttonRef = useRef<HTMLDivElement>(null);
  const { loginWithGoogle, linkGoogle } = useAuth();
  const { isRtl } = useI18n();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function initGoogle() {
      try {
        const config = await api.get<PublicConfigResponse>('/config');
        if (!config.googleClientId) {
          return;
        }

        const { nonce } = await api.get<NonceResponse>('/auth/nonce');

        const checkGoogleSdk = setInterval(() => {
          if ((window as any).google?.accounts?.id && buttonRef.current) {
            clearInterval(checkGoogleSdk);

            (window as any).google.accounts.id.initialize({
              client_id: config.googleClientId,
              nonce,
              callback: async (response: any) => {
                try {
                  if (isLinking) {
                    await linkGoogle(response.credential);
                  } else {
                    await loginWithGoogle(response.credential);
                  }
                  if (onSuccess) onSuccess();
                } catch (err: any) {
                  if (isMounted) setError(err.message || 'فشل تسجيل الدخول بحساب Google');
                }
              }
            });

            buttonRef.current.innerHTML = '';
            (window as any).google.accounts.id.renderButton(buttonRef.current, {
              type: 'standard',
              theme: 'outline',
              size: 'large',
              text: isLinking ? 'continue_with' : 'signin_with',
              shape: 'pill',
              logo_alignment: 'right',
              width: 320
            });
          }
        }, 150);

        setTimeout(() => clearInterval(checkGoogleSdk), 10000);
      } catch (err: any) {
        if (isMounted) setError(err.message || 'تعذر تحميل إعدادات Google');
      }
    }

    initGoogle();

    return () => {
      isMounted = false;
    };
  }, [isLinking]);

  return (
    <div className="flex flex-col items-center justify-center w-full my-2">
      <div ref={buttonRef} className="flex justify-center w-full min-h-[44px]">
        <div className="text-xs text-slate-400 py-2">{isRtl ? 'جاري تجهيز زر Google...' : 'Preparing Google Sign-In...'}</div>
      </div>
      {error && <div className="text-xs text-rose-500 mt-2 text-center">{error}</div>}
    </div>
  );
};
