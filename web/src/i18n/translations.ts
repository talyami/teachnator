export type Language = 'ar' | 'en';

export interface Translations {
  common: {
    appName: string;
    version: string;
    appTagline: string;
    save: string;
    cancel: string;
    close: string;
    delete: string;
    loading: string;
    error: string;
    success: string;
    back: string;
    next: string;
    confirm: string;
    edit: string;
    view: string;
    search: string;
    active: string;
    banned: string;
    roleUser: string;
    roleAdmin: string;
    planFree: string;
    planUnlimited: string;
    yes: string;
    no: string;
  };
  header: {
    ambientFocus: string;
    ambientActive: string;
    ambientMute: string;
    gammaLabel: string;
    alphaLabel: string;
    gammaDesc: string;
    alphaDesc: string;
    unlimited: string;
    todayAllowance: string;
    myLibrary: string;
    settings: string;
    adminDashboard: string;
    logout: string;
    login: string;
    guestFreeLeft: string;
    guestFreeExpired: string;
    switchLang: string;
  };
  guestBanner: {
    browsingAsGuest: string;
    quizzesRemaining: string;
    signInPrompt: string;
  };
  createQuiz: {
    badge: string;
    title: string;
    subtitle: string;
    tabText: string;
    tabFile: string;
    titleInputLabel: string;
    titlePlaceholder: string;
    contentInputLabel: string;
    contentPlaceholder: string;
    fileUploadTitle: string;
    fileUploadDesc: string;
    fileFormatsNotice: string;
    selectedFile: string;
    removeFile: string;
    questionCountLabel: string;
    difficultyLabel: string;
    diffEasy: string;
    diffMedium: string;
    diffHard: string;
    modelLabel: string;
    materialLangLabel: string;
    langAuto: string;
    langAr: string;
    langEn: string;
    generateBtn: string;
    generating: string;
    step1: string;
    step2: string;
    step3: string;
    validationShortText: string;
    usingPersonalKeyNotice: string;
  };
  study: {
    modeQuiz: string;
    modeLearn: string;
    questionProgress: string;
    streakCount: string;
    scoreLabel: string;
    tapToReveal: string;
    tapToHide: string;
    mnemonicSecret: string;
    explanationLabel: string;
    correctAnswerIs: string;
    listenAudio: string;
    stopAudio: string;
    nextQuestion: string;
    submitQuiz: string;
    finishQuiz: string;
    resultsTitle: string;
    resultsGreatJob: string;
    resultsPracticeMore: string;
    yourScore: string;
    percentage: string;
    correctAnswers: string;
    wrongAnswers: string;
    reviewMistakesOnly: string;
    restartFullQuiz: string;
    savedInCloud: string;
    saveToCloud: string;
    cloudSaveSuccess: string;
    exitConfirm: string;
    shortAnswerPlaceholder: string;
    submitShortAnswer: string;
    evaluatingAnswer: string;
  };
  library: {
    title: string;
    subtitleCloud: string;
    subtitleLocal: string;
    emptyTitle: string;
    emptyDesc: string;
    generateNewQuiz: string;
    questionsCount: string;
    continueQuiz: string;
    startFromStart: string;
    deletePrompt: string;
    sourceText: string;
    sourceFile: string;
  };
  settings: {
    title: string;
    subtitle: string;
    byokTitle: string;
    byokBadge: string;
    byokDesc: string;
    byokPlaceholder: string;
    byokToggle: string;
    saveKeyBtn: string;
    testKeyBtn: string;
    testingKey: string;
    testSuccess: string;
    testFailed: string;
    speechSpeedTitle: string;
    speechSpeedNormal: string;
    speechSpeedFast: string;
    speechSpeedFaster: string;
    noiseTitle: string;
    noiseDesc: string;
    noiseVolume: string;
    linkedAccountsTitle: string;
    linkGoogle: string;
    linkApple: string;
    alreadyLinked: string;
  };
  admin: {
    title: string;
    subtitle: string;
    tabUsers: string;
    tabKeys: string;
    tabAudit: string;
    tabTest: string;
    statUsers: string;
    statActiveToday: string;
    statMaterials: string;
    statAttempts: string;
    statUnitsToday: string;
    statKeys: string;
    searchPlaceholder: string;
    tableUser: string;
    tableRole: string;
    tablePlan: string;
    tableUsageToday: string;
    tableAssignedKey: string;
    tableStatus: string;
    tableActions: string;
    editUserTitle: string;
    customDailyLimit: string;
    defaultForPlan: string;
    assignServerKey: string;
    sharedPoolDefault: string;
    banUser: string;
    activateUser: string;
    revokeAllSessions: string;
    addNewKeyTitle: string;
    keyLabel: string;
    keyValue: string;
    isDefaultKey: string;
    addKeyBtn: string;
    keyPoolTitle: string;
    noKeysFound: string;
    auditLogTitle: string;
    testAiTitle: string;
    testAiDesc: string;
    runAiTestBtn: string;
    testSuccessful: string;
    testFailed: string;
  };
  authModal: {
    title: string;
    subtitle: string;
    benefit1: string;
    benefit2: string;
    benefit3: string;
    googleBtn: string;
    appleBtn: string;
    privacyNotice: string;
  };
  footer: {
    copyright: string;
  };
}

export const translations: Record<Language, Translations> = {
  ar: {
    common: {
      appName: 'المولد الذكي',
      version: 'v2.0',
      appTagline: 'الحفظ والفهم السريع بمفاتيح الذاكرة السحرية',
      save: 'حفظ',
      cancel: 'إلغاء',
      close: 'إغلاق',
      delete: 'حذف',
      loading: 'جاري التحميل...',
      error: 'خطأ',
      success: 'تم بنجاح',
      back: 'رجوع',
      next: 'التالي',
      confirm: 'تأكيد',
      edit: 'تعديل',
      view: 'عرض',
      search: 'بحث...',
      active: 'نشط',
      banned: 'محظور',
      roleUser: 'مستخدم',
      roleAdmin: 'مشرف',
      planFree: 'مجاني',
      planUnlimited: 'غير محدود',
      yes: 'نعم',
      no: 'لا'
    },
    header: {
      ambientFocus: 'موسيقى التركيز',
      ambientActive: 'تركيز نشط',
      ambientMute: 'إيقاف موسيقى التركيز',
      gammaLabel: 'غاما 40Hz',
      alphaLabel: 'ألفا 10Hz',
      gammaDesc: 'موجات غاما (40Hz) لربط الذاكرة وسرعة المعالجة',
      alphaDesc: 'موجات ألفا (10Hz) للاسترخاء الذهني والتدفق',
      unlimited: 'غير محدود ⚡',
      todayAllowance: 'اليوم',
      myLibrary: 'مكتبتي وموادي المحفوظة',
      settings: 'الإعدادات والمفتاح الشخصي',
      adminDashboard: 'لوحة تحكم المشرف',
      logout: 'تسجيل الخروج',
      login: 'تسجيل الدخول',
      guestFreeLeft: 'اختبارات مجانية اليوم',
      guestFreeExpired: 'انتهى الرصيد المجاني',
      switchLang: 'English'
    },
    guestBanner: {
      browsingAsGuest: 'أنت تتصفح كزائر ({count} اختبارات متبقية لك اليوم).',
      quizzesRemaining: 'اختبارات متبقية',
      signInPrompt: 'سجل دخولك بنقرة واحدة لحفظ إنجازاتك والحصول على حصة سحابية كاملة!'
    },
    createQuiz: {
      badge: '✨ تقنية الحفظ السريع بالمفاتيح السحرية',
      title: 'حوّل أي درس إلى مسابقة تفاعلية ذكية',
      subtitle: 'ألصق المحتوى أو ارفع ملف Word وسيقوم الذكاء الاصطناعي ببناء أسئلة متقنة مع روابط ذهنية تساعدك على تثبيت المعلومات فوراً.',
      tabText: '📝 كتابة / لصق نص',
      tabFile: '📄 رفع ملف (Word / مستند)',
      titleInputLabel: 'عنوان المادة أو الدرس (اختياري)',
      titlePlaceholder: 'مثال: ملخص الأحياء - الفصل الثالث',
      contentInputLabel: 'محتوى الدرس أو المادة التعليمية',
      contentPlaceholder: 'ألصق هنا النص التعليمي، الشرح، القوانين، أو المذكرة التي تريد التدرب عليها وحفظها...',
      fileUploadTitle: 'اسحب وأفلت الملف هنا، أو انقر للاختيار',
      fileUploadDesc: 'يدعم ملفات Word (.docx) والمستندات النصية (.txt)',
      fileFormatsNotice: 'يتم قراءة النصوص فورياً داخل متصفحك بأمان',
      selectedFile: 'الملف المختار:',
      removeFile: 'إزالة الملف',
      questionCountLabel: 'عدد الأسئلة المطلوبة:',
      difficultyLabel: 'مستوى الصعوبة:',
      diffEasy: 'سهل',
      diffMedium: 'متوسط',
      diffHard: 'متقدم',
      modelLabel: 'نموذج الذكاء الاصطناعي:',
      materialLangLabel: 'لغة المادة والأسئلة:',
      langAuto: '🌐 تلقائي (حسب لغة المادة)',
      langAr: '🇸🇦 العربية (Arabic)',
      langEn: '🇺🇸 الإنجليزية (English)',
      generateBtn: '⚡ بناء الاختبار ومفاتيح الذاكرة',
      generating: 'جاري إنشاء الاختبار ومفاتيح الحفظ...',
      step1: 'تحليل النص واستخراج المفاهيم الأساسية...',
      step2: 'صياغة الأسئلة الذكية والخيارات الدقيقة...',
      step3: 'ابتكار مفاتيح الحفظ السحرية والشروحات التربوية...',
      validationShortText: 'يرجى كتابة أو رفع محتوى تعليمي كافٍ لتوليد الاختبار (15 حرف على الأقل)',
      usingPersonalKeyNotice: 'يتم استخدام مفتاح Gemini الشخصي الخاص بك مباشرة من المتصفح 🔒'
    },
    study: {
      modeQuiz: '🎯 نمط الاختبار (Quiz)',
      modeLearn: '🧠 نمط المذاكرة (Flashcards)',
      questionProgress: 'السؤال',
      streakCount: 'متتالية صحيحة!',
      scoreLabel: 'النقاط',
      tapToReveal: 'انقر لكشف مفتاح الحفظ والشرح 💡',
      tapToHide: 'انقر للعودة إلى السؤال',
      mnemonicSecret: '💡 مفتاح الحفظ السحري (Mnemonic)',
      explanationLabel: '📖 الشرح والتوضيح',
      correctAnswerIs: 'الإجابة الصحيحة هي:',
      listenAudio: 'استماع صوتي 🔊',
      stopAudio: 'إيقاف الصوت ⏹️',
      nextQuestion: 'السؤال التالي ⬅️',
      submitQuiz: 'إنهاء الاختبار 🏁',
      finishQuiz: 'إتمام المذاكرة 🏆',
      resultsTitle: 'نتيجة التحدي',
      resultsGreatJob: 'رائع جداً! تم ترسيخ المفاهيم بنجاح 🎉',
      resultsPracticeMore: 'أداء جيد! راجع الأخطاء لتعزيز الحفظ والفهم 📚',
      yourScore: 'نتيجتك:',
      percentage: 'نسبة الإتقان',
      correctAnswers: 'إجابات صحيحة',
      wrongAnswers: 'بحاجة مراجعة',
      reviewMistakesOnly: '🔍 مراجعة الأخطاء فقط',
      restartFullQuiz: '🔄 إعادة الاختبار كاملاً',
      savedInCloud: '✅ تم حفظ الاختبار في مكتبتك السحابية',
      saveToCloud: '☁️ حفظ في مكتبتي السحابية',
      cloudSaveSuccess: 'تم حفظ المادة في مكتبتك السحابية بنجاح!',
      exitConfirm: 'هل أنت متأكد من الخروج من جلسة الدراسة؟',
      shortAnswerPlaceholder: 'اكتب إجابتك هنا...',
      submitShortAnswer: 'تحقق من الإجابة',
      evaluatingAnswer: 'جاري تقييم الإجابة ذكياً...'
    },
    library: {
      title: 'مكتبتي وموادي المحفوظة',
      subtitleCloud: 'محفوظة في سحابتك الآمنة، متاحة من أي جهاز',
      subtitleLocal: 'محفوظة في هذا المتصفح فقط (سجل الدخول للمزامنة السحابية)',
      emptyTitle: 'لا توجد مواد محفوظة بعد',
      emptyDesc: 'قم بتوليد أول مسابقة أو اختبار تعليمي لتتمكن من مراجعته واستئنافه في أي وقت!',
      generateNewQuiz: 'توليد اختبار جديد الآن',
      questionsCount: 'سؤال',
      continueQuiz: 'متابعة الحل',
      startFromStart: 'بدء من جديد',
      deletePrompt: 'هل أنت متأكد من حذف هذه المادة؟',
      sourceText: 'نص مباشر',
      sourceFile: 'ملف مستند'
    },
    settings: {
      title: 'الإعدادات والتخصيص',
      subtitle: 'تخصيص الذكاء الاصطناعي والمحرك الصوتي',
      byokTitle: 'مفتاحك الخاص (BYOK)',
      byokBadge: 'خصوصية مطلقة 🔒',
      byokDesc: 'استخدم مفتاح Google Gemini الشخصي الخاص بك مباشرة من متصفحك. المفتاح لا يمر بالسيرفر أبداً ويعطيك استهلاكاً غير محدود.',
      byokPlaceholder: 'الصق مفتاحك: AIzaSy...',
      byokToggle: 'تفعيل استخدام مفتاحي الشخصي',
      saveKeyBtn: 'حفظ المفتاح محلياً',
      testKeyBtn: 'اختبار المفتاح ⚡',
      testingKey: 'جاري التحقق من المفتاح مع Google Gemini API...',
      testSuccess: '✅ المفتاح يعمل بنجاح ومصرح له!',
      testFailed: '❌ فشل التحقق من المفتاح:',
      speechSpeedTitle: 'سرعة القراءة الصوتية',
      speechSpeedNormal: 'عادية (1x)',
      speechSpeedFast: 'سريعة (1.25x)',
      speechSpeedFaster: 'فائقة (1.5x)',
      noiseTitle: 'الضوضاء الوردية (Pink Noise)',
      noiseDesc: 'صوت ترددات خافت يعزل الضوضاء المحيطة ويعزز موجات الدماغ أثناء القراءة.',
      noiseVolume: 'مستوى صوت الضوضاء',
      linkedAccountsTitle: 'الحسابات المرتبطة',
      linkGoogle: 'ربط حساب Google',
      linkApple: 'ربط حساب Apple',
      alreadyLinked: 'مرتبط بالفعل'
    },
    admin: {
      title: 'لوحة تحكم المشرف (Admin)',
      subtitle: 'إدارة المستخدمين، الحصص، ومجمّع المفاتيح السحابية',
      tabUsers: '👥 المستخدمون',
      tabKeys: '🔑 مجمّع المفاتيح',
      tabAudit: '📜 سجل الرقابة',
      tabTest: '🧪 فحص الذكاء الاصطناعي',
      statUsers: 'إجمالي المستخدمين',
      statActiveToday: 'نشطون اليوم',
      statMaterials: 'المواد المنشأة',
      statAttempts: 'المحاولات المنجزة',
      statUnitsToday: 'وحدات AI اليوم',
      statKeys: 'مفاتيح السيرفر',
      searchPlaceholder: 'بحث بالاسم أو البريد الإلكتروني...',
      tableUser: 'المستخدم',
      tableRole: 'الرتبة',
      tablePlan: 'الباقة',
      tableUsageToday: 'استهلاك اليوم',
      tableAssignedKey: 'المفتاح المخصص',
      tableStatus: 'الحالة',
      tableActions: 'الإجراءات',
      editUserTitle: 'تعديل بيانات وصلاحيات المستخدم',
      customDailyLimit: 'حد استهلاك يومي مخصص (اختياري)',
      defaultForPlan: 'الافتراضي حسب الباقة',
      assignServerKey: 'المفتاح المخصص للسيرفر:',
      sharedPoolDefault: 'المجمّع المشترك العام (الافتراضي)',
      banUser: 'حظر المستخدم',
      activateUser: 'تفعيل المستخدم',
      revokeAllSessions: 'تسجيل الخروج من كل الأجهزة',
      addNewKeyTitle: 'إضافة مفتاح سيرفر جديد إلى المجمّع',
      keyLabel: 'اسم أو تصنيف المفتاح (مثال: مفتاح خاص بصف أ)',
      keyValue: 'قيمة المفتاح (AIzaSy...)',
      isDefaultKey: 'تعيين كمفتاح افتراضي للمجمّع العام',
      addKeyBtn: 'إضافة وتشفير المفتاح في القاعدة',
      keyPoolTitle: 'مفاتيح السيرفر المعتمدة (مشفرة بـ AES-256)',
      noKeysFound: 'لا توجد مفاتيح مسجلة في المجمّع بعد.',
      auditLogTitle: 'سجل العمليات والرقابة الإدارية',
      testAiTitle: 'فحص جاهزية مفتاح السيرفر الرئيسي',
      testAiDesc: 'اختبار الاتصال المباشر بنموذج Gemini عبر مفتاح السيرفر وقياس سرعة الاستجابة.',
      runAiTestBtn: 'تشغيل فحص الاتصال ⚡',
      testSuccessful: '✅ الاتصال ناجح ومستقر!',
      testFailed: '❌ فشل فحص الاتصال:'
    },
    authModal: {
      title: 'تسجيل الدخول إلى Fast Learning',
      subtitle: 'احفظ تقدمك واستمتع بمميزات الذكاء الاصطناعي الكاملة',
      benefit1: 'حفظ واستئناف الاختبارات من أي جهاز بدقة تامة 📱',
      benefit2: 'حصة سحابية مجانية يومية مدعومة بمفتاح المنصة ⚡',
      benefit3: 'مكتبة سحابية آمنة لموادك وملخصاتك الدراسية ☁️',
      googleBtn: 'المتابعة باستخدام Google',
      appleBtn: 'المتابعة باستخدام Apple',
      privacyNotice: 'تسجيل دخول سريع وآمن بدون كلمات مرور.'
    },
    footer: {
      copyright: 'المولد الذكي للاختبارات الفائقة © 2026 — مدعوم بمحرك Google Gemini وموجات التنشيط العصبي التكيفية'
    }
  },
  en: {
    common: {
      appName: 'Fast Learning',
      version: 'v2.0',
      appTagline: 'Rapid retention & deep understanding powered by mnemonics',
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
      delete: 'Delete',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      back: 'Back',
      next: 'Next',
      confirm: 'Confirm',
      edit: 'Edit',
      view: 'View',
      search: 'Search...',
      active: 'Active',
      banned: 'Banned',
      roleUser: 'User',
      roleAdmin: 'Admin',
      planFree: 'Free',
      planUnlimited: 'Unlimited',
      yes: 'Yes',
      no: 'No'
    },
    header: {
      ambientFocus: 'Focus Music',
      ambientActive: 'Focus Active',
      ambientMute: 'Mute Focus Music',
      gammaLabel: 'Gamma 40Hz',
      alphaLabel: 'Alpha 10Hz',
      gammaDesc: 'Gamma waves (40Hz) for memory binding and processing speed',
      alphaDesc: 'Alpha waves (10Hz) for mental relaxation and flow state',
      unlimited: 'Unlimited ⚡',
      todayAllowance: 'today',
      myLibrary: 'My Library & Materials',
      settings: 'Settings & Personal Key',
      adminDashboard: 'Admin Dashboard',
      logout: 'Sign Out',
      login: 'Sign In',
      guestFreeLeft: 'free quizzes today',
      guestFreeExpired: 'Free limit reached',
      switchLang: 'العربية'
    },
    guestBanner: {
      browsingAsGuest: 'You are browsing as a guest ({count} quizzes remaining today).',
      quizzesRemaining: 'quizzes remaining',
      signInPrompt: 'Sign in with one click to save your progress and get your full cloud allowance!'
    },
    createQuiz: {
      badge: '✨ Rapid Memory & Mnemonic Retention Technology',
      title: 'Turn Any Lesson into an Interactive Smart Quiz',
      subtitle: 'Paste your content or upload a Word document. AI will construct high-yield questions with clever mental links to anchor information instantly.',
      tabText: '📝 Type / Paste Text',
      tabFile: '📄 Upload File (Word / Doc)',
      titleInputLabel: 'Material or Lesson Title (Optional)',
      titlePlaceholder: 'e.g. Biology - Chapter 3 Cellular Respiration',
      contentInputLabel: 'Study Content / Lesson Text',
      contentPlaceholder: 'Paste educational text, summary notes, formulas, or lesson transcripts here...',
      fileUploadTitle: 'Drag & drop your file here, or click to browse',
      fileUploadDesc: 'Supports Word files (.docx) and plain text documents (.txt)',
      fileFormatsNotice: 'Files are processed securely and privately in your browser',
      selectedFile: 'Selected File:',
      removeFile: 'Remove File',
      questionCountLabel: 'Desired Number of Questions:',
      difficultyLabel: 'Difficulty Level:',
      diffEasy: 'Easy',
      diffMedium: 'Medium',
      diffHard: 'Advanced',
      modelLabel: 'AI Engine Model:',
      materialLangLabel: 'Material & Quiz Language:',
      langAuto: '🌐 Auto-detect (Match Material)',
      langAr: '🇸🇦 Arabic (العربية)',
      langEn: '🇺🇸 English',
      generateBtn: '⚡ Generate Quiz & Mnemonics',
      generating: 'Building quiz & memory hooks...',
      step1: 'Analyzing text and extracting core concepts...',
      step2: 'Crafting precise questions and verified options...',
      step3: 'Forging mnemonic memory keys and educational explanations...',
      validationShortText: 'Please enter or upload sufficient study content (at least 15 characters)',
      usingPersonalKeyNotice: 'Using your personal Gemini API key directly from your browser 🔒'
    },
    study: {
      modeQuiz: '🎯 Quiz Mode',
      modeLearn: '🧠 Flashcard Study Mode',
      questionProgress: 'Question',
      streakCount: 'Correct Streak!',
      scoreLabel: 'Score',
      tapToReveal: 'Click to reveal mnemonic key & explanation 💡',
      tapToHide: 'Click to return to question',
      mnemonicSecret: '💡 Magic Mnemonic Key',
      explanationLabel: '📖 Explanation & Rationale',
      correctAnswerIs: 'The correct answer is:',
      listenAudio: 'Listen 🔊',
      stopAudio: 'Stop ⏹️',
      nextQuestion: 'Next Question ➡️',
      submitQuiz: 'Finish Quiz 🏁',
      finishQuiz: 'Complete Study 🏆',
      resultsTitle: 'Challenge Results',
      resultsGreatJob: 'Outstanding! Core concepts mastered successfully 🎉',
      resultsPracticeMore: 'Good effort! Review missed items to reinforce your memory 📚',
      yourScore: 'Your Score:',
      percentage: 'Mastery Rate',
      correctAnswers: 'Correct',
      wrongAnswers: 'Needs Review',
      reviewMistakesOnly: '🔍 Review Mistakes Only',
      restartFullQuiz: '🔄 Restart Full Quiz',
      savedInCloud: '✅ Quiz saved to your cloud library',
      saveToCloud: '☁️ Save to Cloud Library',
      cloudSaveSuccess: 'Material saved to your cloud library successfully!',
      exitConfirm: 'Are you sure you want to leave this study session?',
      shortAnswerPlaceholder: 'Type your answer here...',
      submitShortAnswer: 'Submit Answer',
      evaluatingAnswer: 'Intelligently evaluating your answer...'
    },
    library: {
      title: 'My Library & Saved Materials',
      subtitleCloud: 'Securely saved in your cloud account, accessible from any device',
      subtitleLocal: 'Saved in this browser only (sign in for cloud sync)',
      emptyTitle: 'No saved materials yet',
      emptyDesc: 'Generate your first interactive quiz to review and resume it anytime!',
      generateNewQuiz: 'Generate New Quiz Now',
      questionsCount: 'questions',
      continueQuiz: 'Resume Attempt',
      startFromStart: 'Start from Beginning',
      deletePrompt: 'Are you sure you want to delete this material?',
      sourceText: 'Direct Text',
      sourceFile: 'Uploaded File'
    },
    settings: {
      title: 'Settings & Customization',
      subtitle: 'Customize AI models and acoustic engines',
      byokTitle: 'Bring Your Own Key (BYOK)',
      byokBadge: '100% Private 🔒',
      byokDesc: 'Use your personal Google Gemini API key straight from your browser. The key never touches the server and gives you unlimited requests.',
      byokPlaceholder: 'Paste your key: AIzaSy...',
      byokToggle: 'Enable personal Gemini API key',
      saveKeyBtn: 'Save Key Locally',
      testKeyBtn: 'Test Key ⚡',
      testingKey: 'Testing key connection with Google Gemini API...',
      testSuccess: '✅ API key verified and working successfully!',
      testFailed: '❌ Key test failed:',
      speechSpeedTitle: 'Voice Narration Speed',
      speechSpeedNormal: 'Normal (1x)',
      speechSpeedFast: 'Fast (1.25x)',
      speechSpeedFaster: 'Turbo (1.5x)',
      noiseTitle: 'Pink Noise Generator',
      noiseDesc: 'Subtle sound spectrum that dampens distracting ambient noise and enhances neural focus while reading.',
      noiseVolume: 'Noise Volume',
      linkedAccountsTitle: 'Linked Accounts',
      linkGoogle: 'Link Google Account',
      linkApple: 'Link Apple Account',
      alreadyLinked: 'Already linked'
    },
    admin: {
      title: 'Admin Dashboard',
      subtitle: 'Manage platform users, allowances, and server key pools',
      tabUsers: '👥 Users',
      tabKeys: '🔑 Key Pool',
      tabAudit: '📜 Audit Log',
      tabTest: '🧪 Test AI',
      statUsers: 'Total Users',
      statActiveToday: 'Active Today',
      statMaterials: 'Materials Created',
      statAttempts: 'Attempts Completed',
      statUnitsToday: 'AI Units Today',
      statKeys: 'Server Keys',
      searchPlaceholder: 'Search by name or email...',
      tableUser: 'User',
      tableRole: 'Role',
      tablePlan: 'Plan',
      tableUsageToday: 'Usage Today',
      tableAssignedKey: 'Assigned Key',
      tableStatus: 'Status',
      tableActions: 'Actions',
      editUserTitle: 'Edit User Permissions & Settings',
      customDailyLimit: 'Custom Daily Allowance Override (Optional)',
      defaultForPlan: 'Default based on plan',
      assignServerKey: 'Dedicated Server Key:',
      sharedPoolDefault: 'Default Shared Pool',
      banUser: 'Ban User',
      activateUser: 'Activate User',
      revokeAllSessions: 'Revoke All Sessions',
      addNewKeyTitle: 'Add New Server Key to Pool',
      keyLabel: 'Key Label / Identifier (e.g. Class A Dedicated)',
      keyValue: 'API Key Value (AIzaSy...)',
      isDefaultKey: 'Set as Default Shared Key',
      addKeyBtn: 'Add & Encrypt Key in Database',
      keyPoolTitle: 'Registered Server Keys (AES-256 Encrypted)',
      noKeysFound: 'No server keys found in pool yet.',
      auditLogTitle: 'Administrative Audit Trail',
      testAiTitle: 'Verify Master Server Key',
      testAiDesc: 'Send a live ping to Gemini models through the server key to measure latency and health.',
      runAiTestBtn: 'Run AI Health Check ⚡',
      testSuccessful: '✅ AI connection healthy and stable!',
      testFailed: '❌ AI health check failed:'
    },
    authModal: {
      title: 'Sign In to Fast Learning',
      subtitle: 'Save your learning journey and unlock full AI capabilities',
      benefit1: 'Save and resume quizzes seamlessly across all your devices 📱',
      benefit2: 'Free daily cloud AI allowance powered by the platform ⚡',
      benefit3: 'Secure personal cloud library for all your study notes ☁️',
      googleBtn: 'Continue with Google',
      appleBtn: 'Continue with Apple',
      privacyNotice: 'Instant passwordless authentication.'
    },
    footer: {
      copyright: 'Fast Learning Smart Quiz Platform © 2026 — Powered by Google Gemini & Adaptive Neuro-Acoustics'
    }
  }
};
