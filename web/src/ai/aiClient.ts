import { api, ClientError } from '../api/client';
import {
  GenerateQuizRequest,
  GenerateQuizResponse,
  EvaluateAnswerRequest,
  EvaluateAnswerResponse,
  TtsRequest,
  TtsResponse
} from '@fast-learning/shared';
import {
  getGuestQuizzesRemainingToday,
  incrementGuestQuizCount
} from '../guest/guestStorage';

export const USER_KEY_STORAGE = 'fl_own_gemini_key';
export const USE_OWN_KEY_FLAG = 'fl_use_own_key';

export function getOwnApiKey(): string {
  try {
    return localStorage.getItem(USER_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function isUsingOwnKey(): boolean {
  try {
    return localStorage.getItem(USE_OWN_KEY_FLAG) === 'true' && Boolean(getOwnApiKey());
  } catch {
    return false;
  }
}

export function setOwnApiKey(key: string, enabled: boolean): void {
  try {
    localStorage.setItem(USER_KEY_STORAGE, key.trim());
    localStorage.setItem(USE_OWN_KEY_FLAG, enabled ? 'true' : 'false');
  } catch {}
}

export function detectLanguage(text: string): 'ar' | 'en' {
  const arabicMatches = text.match(/[\u0600-\u06FF]/g) || [];
  const latinMatches = text.match(/[a-zA-Z]/g) || [];
  return arabicMatches.length > latinMatches.length ? 'ar' : 'en';
}

/**
 * Direct browser call to Google Gemini REST API using user's personal key.
 * This guarantees the user's private key never touches the server.
 */
async function callDirectGemini(
  prompt: string,
  systemInstruction?: string,
  modelName = 'gemini-2.5-flash'
): Promise<string> {
  const key = getOwnApiKey();
  if (!key) throw new Error('المفتاح الشخصي غير موجود / Personal API key not found');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;

  const body: any = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192
    }
  };

  if (systemInstruction) {
    body.systemInstruction = {
      role: 'system',
      parts: [{ text: systemInstruction }]
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error('فشل الاتصال بمفتاحك الشخصي عبر Google / Connection to Google API failed: ' + errText);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('لم يتم استلام نص من نموذج الذكاء الاصطناعي / No text returned from model');
  return text;
}

export async function generateQuizAI(
  req: GenerateQuizRequest,
  isAuthenticated: boolean,
  onPromptSignIn: () => void
): Promise<GenerateQuizResponse> {
  const detected = detectLanguage(req.text || '');
  const isEnglish = req.language === 'en' || (req.language !== 'ar' && detected === 'en');

  // 1. If using own key: call directly from browser
  if (isUsingOwnKey()) {
    const system = isEnglish
      ? `You are an expert cognitive educator. Your mission is to analyze educational text and generate high-yield multiple-choice questions designed for rapid memorization and deep understanding with clever mnemonics.
CRITICAL: Generate ALL questions, options, explanations, and mnemonics in ENGLISH (matching the material). Return strictly valid JSON.`
      : `أنت خبير تربوي متقدم. مهمتك إنشاء أسئلة اختيار من متعدد تفاعلية فائقة الجودة لترسيخ الحفظ والفهم السريع مع مفاتيح حفظ سحرية وشرح.
هام: يجب إنشاء جميع الأسئلة والخيارات والشروحات بنفس لغة المادة (العربية). الناتج حصراً بصيغة JSON.`;

    const prompt = isEnglish
      ? `Generate ${req.questionCount || 10} quiz questions for the following material:\nTitle: ${req.title || 'Study Material'}\n\nContent:\n${req.text}\n\nReturn strictly JSON with "title" and "questions" array (id, question, options (4 options), correct_index (0-3), explanation, mnemonic).`
      : `ولد ${req.questionCount || 10} أسئلة اختبار للمادة التالية:\nعنوان: ${req.title || 'مادة'}\n\nنص:\n${req.text}\n\nأرجع JSON يحتوي على title ومصفوفة questions (id, question, options (4 خيارات), correct_index (0-3), explanation, mnemonic).`;

    const raw = await callDirectGemini(prompt, system, req.model || 'gemini-2.5-flash');
    const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);

    return {
      title: parsed.title || req.title || (isEnglish ? 'Interactive Quiz' : 'اختبار تفاعلي جديد'),
      questions: parsed.questions
    };
  }

  // 2. If signed in: use server task endpoint
  if (isAuthenticated) {
    return await api.post<GenerateQuizResponse>('/ai/generate-quiz', {
      ...req,
      language: req.language || (isEnglish ? 'en' : 'ar')
    });
  }

  // 3. Guest without own key: check guest limit
  const remaining = getGuestQuizzesRemainingToday();
  if (remaining <= 0) {
    onPromptSignIn();
    throw new ClientError({
      code: 'GUEST_LIMIT_REACHED',
      message: 'لقد استهلكت اختباراتك المجانية الثلاثة اليوم. سجل الدخول للمتابعة مجاناً أو استخدم مفتاحك الشخصي!',
      status: 403
    });
  }

  // Guest call through server (within guest allowance)
  try {
    const result = await api.post<GenerateQuizResponse>('/ai/generate-quiz', {
      ...req,
      language: req.language || (isEnglish ? 'en' : 'ar')
    });
    incrementGuestQuizCount();
    return result;
  } catch (err: any) {
    if (err.status === 401) {
      onPromptSignIn();
    }
    throw err;
  }
}

export async function evaluateAnswerAI(
  req: EvaluateAnswerRequest,
  isAuthenticated: boolean
): Promise<EvaluateAnswerResponse> {
  const detected = detectLanguage(`${req.question} ${req.studentAnswer}`);
  const isEnglish = req.language === 'en' || (req.language !== 'ar' && detected === 'en');

  if (isUsingOwnKey()) {
    const prompt = isEnglish
      ? `Evaluate the student's answer against the target model answer:\nQuestion: ${req.question}\nModel Answer: ${req.correctAnswer}\nStudent Answer: ${req.studentAnswer}\n\nReturn strictly JSON: { "isCorrect": true/false, "score": 0-100, "feedback": "constructive feedback in English" }`
      : `قيم إجابة الطالب بالنسبة للإجابة النموذجية:\nالسؤال: ${req.question}\nالنموذجية: ${req.correctAnswer}\nإجابة الطالب: ${req.studentAnswer}\n\nأرجع JSON فقط: { "isCorrect": true/false, "score": 0-100, "feedback": "ملاحظات" }`;
    const raw = await callDirectGemini(prompt, isEnglish ? 'You are an educational evaluator' : 'أنت مصحح تربوي ذكي وعادل باللغة العربية');
    const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(clean);
  }

  return await api.post<EvaluateAnswerResponse>('/ai/evaluate-answer', {
    ...req,
    language: req.language || (isEnglish ? 'en' : 'ar')
  });
}

export async function fetchTtsAI(
  req: TtsRequest,
  isAuthenticated: boolean
): Promise<TtsResponse> {
  return await api.post<TtsResponse>('/ai/tts', req);
}
