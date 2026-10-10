import { GenerateQuizRequest, GenerateQuizResponse, Question } from '@fast-learning/shared';
import { AppError } from '../../lib/errors.js';
import { getGeminiModel } from '../gemini.js';

export function detectTextLanguage(text: string): 'ar' | 'en' | 'other' {
  const arabicMatches = text.match(/[\u0600-\u06FF]/g) || [];
  const latinMatches = text.match(/[a-zA-Z]/g) || [];
  if (arabicMatches.length > latinMatches.length) return 'ar';
  if (latinMatches.length > 0) return 'en';
  return 'ar';
}

export async function executeGenerateQuiz(
  apiKey: string,
  modelName: string,
  request: GenerateQuizRequest
): Promise<GenerateQuizResponse> {
  const count = Math.min(Math.max(Number(request.questionCount) || 10, 1), 50);
  const textContent = (request.text || '').trim();

  if (!textContent) {
    throw new AppError({
      code: 'MISSING_TEXT',
      message: 'نص المادة التعليمية مطلوب لتوليد الاختبار / Study material text is required',
      statusCode: 400
    });
  }

  // Max input length validation
  if (textContent.length > 200000) {
    throw new AppError({
      code: 'TEXT_TOO_LARGE',
      message: 'حجم النص المدخل يتجاوز الحد المسموح به (200,000 حرف) / Text exceeds allowed limit',
      statusCode: 400
    });
  }

  // Determine target language: explicit setting > auto-detection
  const requestedLang = request.language || 'auto';
  const detectedLang = detectTextLanguage(textContent);
  const isEnglish = requestedLang === 'en' || (requestedLang === 'auto' && detectedLang === 'en');

  const systemInstruction = isEnglish
    ? `You are a world-class cognitive educator and interactive quiz specialist (Fast Learning AI).
Your mission is to analyze educational text and create high-yield multiple-choice questions engineered for rapid memorization, retrieval practice, and deep understanding.

MANDATORY RULES:
1. LANGUAGE FIDELITY: Generate ALL questions, options, explanations, and mnemonics in the EXACT SAME LANGUAGE as the source material (English). Do not translate into other languages.
2. Questions must be smart, accurate, and completely grounded in the provided content.
3. Each question must have 4 clear distinct options (or 2 for True/False questions: ["True", "False"]), with exactly one correct option.
4. "correct_index" is the 0-based index of the correct option (0, 1, 2, or 3).
5. "explanation" is a concise, educational rationale clarifying why the correct option is right.
6. "mnemonic" is a magic memory hook, vivid analogy, catchy rhyme, or clever mental trick that anchors the question to the answer for effortless long-term recall.
7. Return strictly valid JSON matching the requested schema with no surrounding commentary.`
    : `أنت خبير تربوي متقدم ومولد اختبارات تفاعلية محترف (Fast Learning AI).
مهمتك تحليل النص التعليمي وإنشاء أسئلة اختبار اختيار من متعدد فائقة الجودة لترسيخ الحفظ والفهم السريع.

الشروط الإلزامية:
1. مطابقة لغة المادة: إنشاء جميع الأسئلة والخيارات والشروحات ومفاتيح الحفظ بنفس لغة المادة التعليمية تماماً.
2. الأسئلة ذكية، دقيقة، ومبنية تماماً على المحتوى المقدم.
3. لكل سؤال 4 خيارات حصرية وواضحة (أو خيارين لأسئلة صح/خطأ: ["صح", "خطأ"])، وخيار واحد صحيح فقط.
4. correct_index هو الرقم التسلسلي للخيار الصحيح يبدأ من 0.
5. explanation هو شرح تعليمي مبسط ومقنع لسبب صحة الخيار.
6. mnemonic هو "مفتاح حفظ سحري" مختصر وطريف أو رابط ذهني ذكي يساعد الطالب على تذكر الإجابة بسهولة فورية.
7. الرد يجب أن يكون حصراً بصيغة JSON صالحة وفق المخطط المطلوب دون أي نصوص إضافية.`;

  const prompt = isEnglish
    ? `TASK: Generate ${count} high-yield multiple-choice quiz questions for the following study material.
Material Title: ${request.title || 'Study Material'}

SOURCE MATERIAL:
"""
${textContent}
"""

Return strictly valid JSON with this exact schema:
{
  "title": "Concise and engaging title for the material in English",
  "questions": [
    {
      "id": 1,
      "question": "Clear, direct question in English?",
      "options": ["First option", "Second option", "Third option", "Fourth option"],
      "correct_index": 0,
      "explanation": "Clear explanation of why this answer is correct",
      "mnemonic": "💡 Magic Memory Key: catchy rhyme, pun, or vivid association linking question to answer"
    }
  ]
}`
    : `المطلوب: توليد ${count} أسئلة اختبار تعليمية عالية الجودة للمادة التالية.
عنوان المادة: ${request.title || 'مادة دراسية'}

نص المادة التعليمية:
"""
${textContent}
"""

أرجع الناتج ككائن JSON بهذا الشكل الدقيق:
{
  "title": "عنوان ملخص وجذاب للمادة",
  "questions": [
    {
      "id": 1,
      "question": "نص السؤال الواضح؟",
      "options": ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"],
      "correct_index": 0,
      "explanation": "شرح واضح لسبب صحة الإجابة",
      "mnemonic": "💡 مفتاح حفظ سحري يربط السؤال بالإجابة بذكاء"
    }
  ]
}`;

  try {
    const model = getGeminiModel(apiKey, modelName, systemInstruction);
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4,
        maxOutputTokens: 8192
      }
    });

    const responseText = result.response.text();
    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      const clean = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(clean);
    }

    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error('لم يتم استخراج أسئلة صالحة من استجابة النموذج / No valid questions found in model response');
    }

    const defaultFallbackOptions = isEnglish ? ['True', 'False'] : ['صح', 'خطأ'];

    const formattedQuestions: Question[] = parsed.questions.slice(0, 50).map((q: any, idx: number) => ({
      id: q.id ?? idx + 1,
      question: String(q.question || (isEnglish ? `Question ${idx + 1}` : `سؤال ${idx + 1}`)).trim(),
      options: Array.isArray(q.options) && q.options.length >= 2
        ? q.options.map((o: any) => String(o).trim())
        : defaultFallbackOptions,
      correct_index: typeof q.correct_index === 'number' && q.correct_index >= 0 && q.correct_index < (q.options?.length || 2)
        ? q.correct_index
        : 0,
      explanation: String(q.explanation || '').trim(),
      mnemonic: String(q.mnemonic || '').trim()
    }));

    return {
      title: parsed.title || request.title || (isEnglish ? 'Interactive Study Quiz' : 'اختبار تفاعلي جديد'),
      questions: formattedQuestions
    };
  } catch (err: any) {
    console.error('Quiz generation error:', err);
    throw new AppError({
      code: 'QUIZ_GENERATION_FAILED',
      message: (isEnglish ? 'AI quiz generation failed: ' : 'فشل توليد الاختبار بواسطة الذكاء الاصطناعي: ') + (err.message || 'Error'),
      statusCode: 502
    });
  }
}
