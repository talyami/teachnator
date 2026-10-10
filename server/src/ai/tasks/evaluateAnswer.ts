import { EvaluateAnswerRequest, EvaluateAnswerResponse } from '@fast-learning/shared';
import { getGeminiModel } from '../gemini.js';
import { AppError } from '../../lib/errors.js';
import { detectTextLanguage } from './generateQuiz.js';

export async function executeEvaluateAnswer(
  apiKey: string,
  modelName: string,
  request: EvaluateAnswerRequest
): Promise<EvaluateAnswerResponse> {
  const { question, correctAnswer, studentAnswer } = request;

  if (!question || !studentAnswer) {
    throw new AppError({
      code: 'MISSING_EVALUATION_INPUT',
      message: 'السؤال وإجابة الطالب مطلوبان للتقييم / Question and student answer are required',
      statusCode: 400
    });
  }

  const detectedLang = detectTextLanguage(`${question} ${studentAnswer}`);
  const isEnglish = request.language === 'en' || (request.language !== 'ar' && detectedLang === 'en');

  const systemPrompt = isEnglish
    ? `You are an expert, encouraging educational assessor.
Your job is to evaluate a student's answer against the target model answer, showing semantic tolerance for slight spelling errors or varied phrasing as long as the core scientific/educational meaning is accurate.
Provide constructive, concise feedback in English.`
    : `أنت مصحح تربوي ذكي وعادل باللغة العربية.
مهمتك تقييم إجابة الطالب القصيرة ومقارنتها بالإجابة النموذجية مع مراعاة المرونة اللغوية وصحة المعنى والمفهوم العلمي دون تشدد في الحروف.
قدم ملاحظات تشجيعية وتوضيحية موجزة بالعربية.`;

  const prompt = isEnglish
    ? `Evaluate the student's answer:
Question: """${question}"""
Model Answer: """${correctAnswer}"""
Student's Answer: """${studentAnswer}"""

Return strictly valid JSON:
{
  "isCorrect": true,
  "score": 100,
  "feedback": "Concise, constructive feedback"
}`
    : `قيم إجابة الطالب بدقة:
السؤال: """${question}"""
الإجابة النموذجية: """${correctAnswer}"""
إجابة الطالب: """${studentAnswer}"""

أرجع الناتج ككائن JSON بهذا الشكل الدقيق:
{
  "isCorrect": true,
  "score": 100,
  "feedback": "ملاحظات تشجيعية وتوضيحية موجزة"
}`;

  try {
    const model = getGeminiModel(apiKey, modelName, systemPrompt);
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 1024
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

    return {
      isCorrect: Boolean(parsed.isCorrect),
      score: typeof parsed.score === 'number' ? Math.max(0, Math.min(100, parsed.score)) : (parsed.isCorrect ? 100 : 0),
      feedback: String(parsed.feedback || '').trim()
    };
  } catch (err: any) {
    console.error('Answer evaluation error:', err);
    throw new AppError({
      code: 'EVALUATION_FAILED',
      message: (isEnglish ? 'Evaluation failed: ' : 'فشل تقييم الإجابة: ') + (err.message || 'Error'),
      statusCode: 502
    });
  }
}
