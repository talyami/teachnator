import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Material, Question, QuizAttempt } from '@fast-learning/shared';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';
import { saveGuestAttempt } from '../../guest/guestStorage';
import {
  playClick,
  playCorrect,
  playWrong,
  playWin,
  playFlipTone,
  playSparkleTone,
  playMasteredTone,
  playStreakTone,
  playMemoryAnchor,
  speakText,
  stopSpeech
} from '../../audio/audioEngine';

interface StudyViewProps {
  material: Material;
  questions: Question[];
  initialAttempt?: QuizAttempt | null;
  onExit: () => void;
}

export const StudyView: React.FC<StudyViewProps> = ({
  material,
  questions,
  initialAttempt,
  onExit
}) => {
  const { user, isAuthenticated, openAuthModal } = useAuth();
  const { t, isRtl } = useI18n();

  const [mode, setMode] = useState<'learn' | 'quiz'>(initialAttempt?.mode || 'quiz');
  const [currentIndex, setCurrentIndex] = useState(initialAttempt?.current_index || 0);
  const [answers, setAnswers] = useState<Record<string, any>>(initialAttempt?.answers || {});
  const [score, setScore] = useState(initialAttempt?.score || 0);
  const [streak, setStreak] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isCompleted, setIsCompleted] = useState(initialAttempt?.status === 'completed');
  const [attemptId, setAttemptId] = useState<number | null>(initialAttempt?.id || null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSavedInCloud, setIsSavedInCloud] = useState(false);

  const currentQ = questions[currentIndex];
  const totalQ = questions.length;

  // Initialize or resume attempt
  useEffect(() => {
    let active = true;

    async function initAttempt() {
      if (initialAttempt?.id) {
        setAttemptId(initialAttempt.id);
        return;
      }

      if (isAuthenticated && material.id) {
        try {
          const res = await api.post<QuizAttempt>('/attempts', {
            material_id: material.id,
            mode,
            question_order: questions.map((_, i) => i)
          });
          if (active) setAttemptId(res.id);
        } catch {}
      }
    }

    initAttempt();
    return () => {
      active = false;
      stopSpeech();
    };
  }, []);

  // Play TMR memory anchor tone when arriving at a question
  useEffect(() => {
    if (!isCompleted && currentQ) {
      playMemoryAnchor(currentIndex);
    }
  }, [currentIndex, isCompleted]);

  // Persist attempt step
  const persistAttempt = async (
    nextIndex: number,
    newAnswers: Record<string, any>,
    newScore: number,
    completed: boolean
  ) => {
    const attemptData: Partial<QuizAttempt> = {
      current_index: nextIndex,
      answers: newAnswers,
      score: newScore,
      status: completed ? 'completed' : 'in_progress'
    };

    if (isAuthenticated && attemptId) {
      try {
        await api.patch(`/attempts/${attemptId}`, attemptData);
      } catch {}
    } else {
      saveGuestAttempt({
        id: Date.now(),
        user_id: 0,
        material_id: material.id,
        mode,
        status: completed ? 'completed' : 'in_progress',
        question_order: questions.map((_, i) => i),
        answers: newAnswers,
        current_index: nextIndex,
        score: newScore,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: completed ? new Date().toISOString() : null
      });
    }
  };

  const handleSelectOption = (idx: number) => {
    if (isAnswered || isCompleted) return;

    setSelectedOption(idx);
    setIsAnswered(true);

    const isCorrect = idx === currentQ.correct_index;
    let newScore = score;
    let newStreak = streak;

    if (isCorrect) {
      newScore += 1;
      newStreak += 1;
      setScore(newScore);
      setStreak(newStreak);
      playCorrect();
      if (newStreak >= 2) {
        playStreakTone(newStreak);
      }
    } else {
      newStreak = 0;
      setStreak(0);
      playWrong();
    }

    const updatedAnswers = {
      ...answers,
      [currentIndex]: {
        chosen: idx,
        isCorrect,
        timeTaken: 5
      }
    };
    setAnswers(updatedAnswers);

    const isLast = currentIndex === totalQ - 1;
    persistAttempt(currentIndex, updatedAnswers, newScore, isLast);
  };

  const handleNextQuestion = () => {
    playClick();
    stopSpeech();
    setIsSpeaking(false);
    setIsAnswered(false);
    setSelectedOption(null);
    setIsFlipped(false);

    if (currentIndex < totalQ - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      persistAttempt(nextIdx, answers, score, false);
    } else {
      setIsCompleted(true);
      playWin();
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
      persistAttempt(currentIndex, answers, score, true);
    }
  };

  const handleFlipCard = () => {
    playFlipTone();
    setIsFlipped(!isFlipped);
    if (!isFlipped) {
      playSparkleTone();
    }
  };

  const handleVoiceNarration = () => {
    if (isSpeaking) {
      stopSpeech();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      const textToRead = isFlipped
        ? `${t.study.correctAnswerIs} ${currentQ.options[currentQ.correct_index]}. ${currentQ.explanation}. ${currentQ.mnemonic}`
        : currentQ.question;
      speakText(textToRead).finally(() => setIsSpeaking(false));
    }
  };

  const handleSaveMaterialToCloud = async () => {
    if (!isAuthenticated) {
      openAuthModal(t.study.saveToCloud);
      return;
    }
    try {
      await api.post('/materials', {
        title: material.title,
        source_type: material.source_type,
        source_name: material.source_name,
        content_preview: material.content_preview,
        questions
      });
      setIsSavedInCloud(true);
      alert(t.study.cloudSaveSuccess);
    } catch (err: any) {
      alert(t.common.error + ': ' + err.message);
    }
  };

  // Result View
  if (isCompleted) {
    const percentage = Math.round((score / totalQ) * 100);
    return (
      <div className="max-w-xl mx-auto px-4 py-12 animate-in zoom-in-95 duration-300 text-center">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 p-8 space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-amber-50 text-amber-500 border border-amber-200 flex items-center justify-center text-4xl mx-auto shadow-inner">
            {percentage >= 80 ? '🏆' : percentage >= 50 ? '🌟' : '💪'}
          </div>

          <div>
            <h2 className="text-2xl font-black text-slate-800">
              {percentage >= 80 ? t.study.resultsGreatJob : t.study.resultsPracticeMore}
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">
              <span className="font-bold text-slate-700">{material.title}</span>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div>
              <div className="text-[11px] font-bold text-slate-400">{t.study.scoreLabel}</div>
              <div className="text-xl font-black text-slate-800">{score}/{totalQ}</div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400">{t.study.percentage}</div>
              <div className="text-xl font-black text-indigo-600">{percentage}%</div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400">{t.study.streakCount}</div>
              <div className="text-xl font-black text-emerald-600">{streak || score} 🔥</div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => {
                setCurrentIndex(0);
                setAnswers({});
                setScore(0);
                setStreak(0);
                setIsCompleted(false);
                setIsAnswered(false);
                setSelectedOption(null);
                persistAttempt(0, {}, 0, false);
              }}
              className="flex-1 py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition cursor-pointer"
            >
              {t.study.restartFullQuiz}
            </button>
            <button
              onClick={onExit}
              className="py-3 px-6 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition cursor-pointer"
            >
              {t.common.back}
            </button>
          </div>

          {isAuthenticated && (
            <div className="pt-2">
              {isSavedInCloud ? (
                <span className="text-xs font-bold text-emerald-600">{t.study.savedInCloud}</span>
              ) : (
                <button
                  onClick={handleSaveMaterialToCloud}
                  className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  {t.study.saveToCloud}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!currentQ) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-slate-500 mb-4">{t.common.error}</p>
        <button onClick={onExit} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold">
          {t.common.back}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 animate-in fade-in duration-300">
      {/* Top Header / Mode Switcher */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <button
          onClick={() => {
            if (confirm(t.study.exitConfirm)) {
              onExit();
            }
          }}
          className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs"
        >
          <span>✕</span>
          <span>{t.common.back}</span>
        </button>

        {/* Mode Pills */}
        <div className="flex items-center bg-slate-200/80 p-1 rounded-2xl shadow-inner">
          <button
            onClick={() => {
              setMode('learn');
              setIsFlipped(false);
            }}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
              mode === 'learn'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.study.modeLearn}
          </button>
          <button
            onClick={() => {
              setMode('quiz');
              setIsFlipped(false);
            }}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
              mode === 'quiz'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.study.modeQuiz}
          </button>
        </div>

        {/* Score & Streak */}
        <div className="flex items-center gap-2">
          {streak >= 2 && (
            <span className="text-xs font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 animate-bounce">
              {streak}x 🔥
            </span>
          )}
          <span className="text-xs font-black text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-xl shadow-xs">
            {score} {t.study.scoreLabel}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200 h-2 rounded-full mb-6 overflow-hidden">
        <div
          className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
          style={{ width: `${((currentIndex + 1) / totalQ) * 100}%` }}
        />
      </div>

      {/* LEARN MODE: Flashcard with 3D Flip */}
      {mode === 'learn' ? (
        <div className="space-y-4">
          <div
            onClick={handleFlipCard}
            className={`min-h-[300px] sm:min-h-[340px] bg-white rounded-3xl p-6 sm:p-8 shadow-xl border transition-all cursor-pointer select-none flex flex-col justify-between relative ${
              isFlipped ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-100'
            }`}
          >
            {/* Header info */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">
                {t.study.questionProgress} {currentIndex + 1} / {totalQ}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    handleVoiceNarration();
                  }}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition cursor-pointer"
                  title={t.study.listenAudio}
                >
                  {isSpeaking ? '⏹' : '🔊'}
                </button>
                <span className="text-xs text-indigo-600 font-semibold">
                  {isFlipped ? t.study.tapToHide : t.study.tapToReveal}
                </span>
              </div>
            </div>

            {/* Card Content */}
            <div className="my-auto py-4">
              {!isFlipped ? (
                <div>
                  <h3 className="text-lg sm:text-xl font-extrabold text-slate-800 leading-relaxed text-center">
                    {currentQ.question}
                  </h3>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in duration-200 text-center">
                  <div className="inline-block px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs">
                    {t.study.correctAnswerIs}
                  </div>
                  <div className="text-xl font-black text-emerald-700">
                    {currentQ.options[currentQ.correct_index]}
                  </div>

                  {currentQ.mnemonic && (
                    <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm font-semibold max-w-md mx-auto shadow-xs">
                      <span className="block font-black text-amber-800 mb-0.5">
                        {t.study.mnemonicSecret}:
                      </span>
                      {currentQ.mnemonic}
                    </div>
                  )}

                  {currentQ.explanation && (
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-lg mx-auto">
                      {currentQ.explanation}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Footer */}
            <div className="text-center text-[11px] text-slate-400">
              {isFlipped ? '✨' : '👆'}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                playMasteredTone();
                handleNextQuestion();
              }}
              className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition cursor-pointer"
            >
              🌟 {t.study.finishQuiz} ({t.common.next})
            </button>
            <button
              onClick={handleNextQuestion}
              className="py-3 px-6 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm transition cursor-pointer"
            >
              {t.common.next}
            </button>
          </div>
        </div>
      ) : (
        /* QUIZ MODE: Multiple Choice */
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-100 space-y-6">
          {/* Question Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-600 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-100">
              {t.study.questionProgress} {currentIndex + 1} / {totalQ}
            </span>
            <button
              onClick={handleVoiceNarration}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition cursor-pointer"
              title={t.study.listenAudio}
            >
              {isSpeaking ? '⏹' : '🔊'}
            </button>
          </div>

          {/* Question Text */}
          <h3 className="text-base sm:text-xl font-extrabold text-slate-800 leading-relaxed">
            {currentQ.question}
          </h3>

          {/* Options Grid */}
          <div className="space-y-3">
            {currentQ.options.map((option, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrectOption = idx === currentQ.correct_index;

              let btnStyle = 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-slate-700';

              if (isAnswered) {
                if (isCorrectOption) {
                  btnStyle = 'border-emerald-500 bg-emerald-50 text-emerald-800 font-bold';
                } else if (isSelected) {
                  btnStyle = 'border-rose-400 bg-rose-50 text-rose-800 font-semibold';
                } else {
                  btnStyle = 'border-slate-100 bg-slate-50 text-slate-400 opacity-60';
                }
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleSelectOption(idx)}
                  disabled={isAnswered}
                  className={`w-full p-4 rounded-2xl border-2 text-start transition flex items-center justify-between cursor-pointer ${btnStyle}`}
                >
                  <span className="text-xs sm:text-sm font-semibold">{option}</span>
                  {isAnswered && isCorrectOption && <span>✅</span>}
                  {isAnswered && isSelected && !isCorrectOption && <span>❌</span>}
                </button>
              );
            })}
          </div>

          {/* Explanation & Mnemonic reveal after answer */}
          {isAnswered && (
            <div className="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-100 space-y-2 animate-in fade-in duration-200">
              {currentQ.mnemonic && (
                <div className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 p-2 rounded-xl">
                  {t.study.mnemonicSecret}: {currentQ.mnemonic}
                </div>
              )}
              {currentQ.explanation && (
                <p className="text-xs text-slate-600 leading-relaxed">
                  {currentQ.explanation}
                </p>
              )}
            </div>
          )}

          {/* Next Button */}
          {isAnswered && (
            <div className="pt-2">
              <button
                onClick={handleNextQuestion}
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm shadow-md shadow-indigo-200 transition cursor-pointer"
              >
                {currentIndex < totalQ - 1 ? t.study.nextQuestion : t.study.submitQuiz}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
