import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';
import { audioEngine } from '../../audio/audioEngine';
import { getOwnApiKey, setOwnApiKey, isUsingOwnKey } from '../../ai/aiClient';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, isAuthenticated } = useAuth();
  const { t } = useI18n();
  const [personalKey, setPersonalKey] = useState<string>(getOwnApiKey() || '');
  const [usePersonalKey, setUsePersonalKey] = useState<boolean>(isUsingOwnKey());
  const [testingKey, setTestingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<string | null>(null);

  const [speechRate, setSpeechRate] = useState<number>(audioEngine.getSpeechRate() || 1.0);

  if (!isOpen) return null;

  const handleSaveKey = () => {
    const trimmed = personalKey.trim();
    if (trimmed) {
      setOwnApiKey(trimmed, usePersonalKey);
      setKeyStatus(t.settings.testSuccess);
    } else {
      setOwnApiKey('', false);
      setUsePersonalKey(false);
      setKeyStatus(null);
    }
  };

  const handleToggleKeyUsage = (enabled: boolean) => {
    setUsePersonalKey(enabled);
    setOwnApiKey(personalKey, enabled);
  };

  const handleTestKey = async () => {
    const trimmed = personalKey.trim();
    if (!trimmed) {
      setKeyStatus(t.settings.byokPlaceholder);
      return;
    }
    setTestingKey(true);
    setKeyStatus(t.settings.testingKey);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${trimmed}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Ping test' }] }]
          })
        }
      );
      if (res.ok) {
        setKeyStatus(t.settings.testSuccess);
        setUsePersonalKey(true);
        setOwnApiKey(trimmed, true);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setKeyStatus(`${t.settings.testFailed} ${errJson.error?.message || res.statusText}`);
      }
    } catch (e: any) {
      setKeyStatus(`${t.settings.testFailed} ${e.message}`);
    } finally {
      setTestingKey(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-100">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center text-xl font-bold">
              ⚙️
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800">{t.settings.title}</h3>
              <p className="text-xs text-slate-400">{t.settings.subtitle}</p>
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
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Section: Personal Gemini Key */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.settings.byokTitle}</span>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                {t.settings.byokBadge}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <p className="text-xs text-slate-600 leading-relaxed">
                {t.settings.byokDesc}
              </p>
              <input
                type="password"
                value={personalKey}
                onChange={e => setPersonalKey(e.target.value)}
                placeholder={t.settings.byokPlaceholder}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />

              {personalKey && (
                <label className="flex items-center gap-2 pt-1 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={usePersonalKey}
                    onChange={e => handleToggleKeyUsage(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span>{t.settings.byokToggle}</span>
                </label>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleSaveKey}
                  className="py-1.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition cursor-pointer"
                >
                  {t.settings.saveKeyBtn}
                </button>
                <button
                  onClick={handleTestKey}
                  disabled={testingKey}
                  className="py-1.5 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {testingKey ? t.settings.testingKey : t.settings.testKeyBtn}
                </button>
              </div>
              {keyStatus && (
                <p className="text-xs font-semibold text-slate-700 pt-1">{keyStatus}</p>
              )}
            </div>
          </div>

          {/* Section: Audio Neuro-Acoustics */}
          <div className="space-y-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.settings.speechSpeedTitle}</span>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">{t.settings.speechSpeedTitle}</span>
                <span className="font-mono text-slate-500">{speechRate}x</span>
              </div>
              <input
                type="range"
                min="0.75"
                max="1.5"
                step="0.05"
                value={speechRate}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setSpeechRate(val);
                  audioEngine.setSpeechRate(val);
                }}
                className="w-full accent-indigo-600"
              />

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-slate-800">{t.header.gammaLabel} / {t.header.alphaLabel}</div>
                  <div className="text-[11px] text-slate-400">{t.header.gammaDesc}</div>
                </div>
                <button
                  onClick={() => audioEngine.toggleBinaural()}
                  className="px-3 py-1 rounded-lg bg-indigo-100 text-indigo-700 font-bold hover:bg-indigo-200 transition cursor-pointer text-xs"
                >
                  {t.common.edit}
                </button>
              </div>
            </div>
          </div>

          {/* Section: Linked Accounts */}
          {isAuthenticated && user && (
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.settings.linkedAccountsTitle}</span>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>🔴</span>
                    <span className="font-bold text-slate-700">Google:</span>
                  </div>
                  <span className="text-emerald-600 font-bold">
                    {user.linkedProviders?.includes('google') ? '✅ ' + t.settings.alreadyLinked : t.common.no}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>🍏</span>
                    <span className="font-bold text-slate-700">Apple:</span>
                  </div>
                  <span className="text-emerald-600 font-bold">
                    {user.linkedProviders?.includes('apple') ? '✅ ' + t.settings.alreadyLinked : t.common.no}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="py-2 px-6 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition cursor-pointer"
          >
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  );
};
