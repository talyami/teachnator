// Application Limits & Quotas configuration

export const LIMITS = {
  guest: {
    maxQuizzesPerDay: 3,
    maxQuestionsPerQuiz: 20,
    maxUploadFiles: 1,
    maxUploadSizeMb: 10,
    voiceNarrationMaxQuestions: 10,
    maxSavedMaterials: 5
  },
  signedIn: {
    free: {
      dailyUnits: 20,
      maxQuestionsPerQuiz: 50,
      maxUploadSizeMb: 15
    },
    unlimited: {
      dailyUnits: 999999,
      maxQuestionsPerQuiz: 50,
      maxUploadSizeMb: 15
    }
  }
} as const;

export const AI_TASK_COSTS = {
  generateQuiz: 5,
  evaluateAnswer: 1,
  ttsPer500Chars: 1
} as const;

export const GUEST_MAX_QUIZZES_PER_DAY = LIMITS.guest.maxQuizzesPerDay;

