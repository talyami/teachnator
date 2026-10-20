import { activeMaterialContext, requestAiCompletion } from './api.js';
import { getContentLanguage, localEvaluateShortAnswer, normalizeQuestion } from '../domain/questions.cjs';
    // مراجعة وتقييم إجابة الطالب عبر نموذج الذكاء الاصطناعي بمعيار 85% الصارم
    const evaluateShortAnswerWithAi = async ({ questionText, expectedAnswer, studentAnswer, hint, language = getContentLanguage(questionText), materialId = null, generationId = null }) => {

      const effectiveMaterialId = materialId || activeMaterialContext?.materialId || null;
      const effectiveGenerationId = generationId || activeMaterialContext?.generationId || null;
      const hasValidContext = Boolean(effectiveMaterialId || effectiveGenerationId);

      // إذا لم تكن المادة مسجلة ومحفوظة على الخادم (مثل أسئلة التجربة النموذجية Demo أو جلسة بدون حفظ)، يتم التقييم الفوري محلياً دون إرسال طلب خادم
      if (!hasValidContext || !localStorage.getItem('auth_token')) {
        return localEvaluateShortAnswer(expectedAnswer, studentAnswer, language);
      }

      try {
        // The server builds the grading prompt from structured answer data.
        const data = await requestAiCompletion({
          purpose: 'brain',
          operation: 'evaluate',
          materialId: effectiveMaterialId,
          generationId: effectiveGenerationId,
          evaluation: { questionText, expectedAnswer, studentAnswer, hint: hint || '', language }
        });

        const parts = data.candidates?.[0]?.content?.parts || [];
        const contentPart = parts.find(p => !p.thought && p.text) || parts[parts.length - 1];
        let responseText = contentPart?.text;
        if (!responseText) throw new Error("لم يصل رد صالح من الذكاء الاصطناعي.");
        responseText = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
        let parsed = JSON.parse(responseText);
        let similarityScore = typeof parsed.similarityScore === 'number' ? parsed.similarityScore : (parsed.isCorrect ? 90 : 40);
        similarityScore = Math.max(0, Math.min(100, Math.round(similarityScore)));
        
        // تطبيق معيار الـ 85% الصارم
        const isCorrect = similarityScore >= 85;

        return {
          isCorrect,
          similarityScore,
          language,
          uiFeedback: !parsed.feedback,
          evaluationMethod: 'ai',
          feedback: parsed.feedback || (isCorrect ? "تقدير الذكاء الاصطناعي: إجابة مقبولة؛ راجع المصدر عند الشك." : "تقدير الذكاء الاصطناعي: راجع إجابتك مقارنة بالمصدر."),
          revisedAnswer: parsed.revisedAnswer || expectedAnswer
        };
      } catch (e) {
        console.warn("AI evaluation warning, falling back to local evaluator:", e.message || e);
        return localEvaluateShortAnswer(expectedAnswer, studentAnswer, language);
      }
    };

    // المساعد 1: الاستخراج الذكي وهندسة الذاكرة العصبية الشاملة (Cognitive Multi-Method Pipeline)
    const draftQuizFromMaterial = async ({ material, generationId, signal }) => {
      // Prompt construction and provider payloads belong to the server.
      const data = await requestAiCompletion({ operation: 'draft', generationId, material, signal });

      const parts = data.candidates?.[0]?.content?.parts || [];
      const contentPart = parts.find(p => !p.thought && p.text) || parts[parts.length - 1];
      let responseText = contentPart?.text;
      
      if (!responseText) throw new Error("لم يصل رد صالح من الذكاء الاصطناعي.");
      responseText = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
      let parsed = JSON.parse(responseText);
      if (!Array.isArray(parsed) && parsed.questions && Array.isArray(parsed.questions)) {
        parsed = parsed.questions;
      }
      return (Array.isArray(parsed) ? parsed : []).map(normalizeQuestion).filter(Boolean);
    };

    // المساعد 2: التدقيق والمراجعة الأكاديمية الصارمة لكافة أنواع الأسئلة وفق سياق المادة
    const reviseQuizDraft = async ({ material, draftQuestions, generationId, signal }) => {
      // Send structured source and draft data; the server owns revision instructions.
      const data = await requestAiCompletion({ operation: 'revise', generationId, material, draftQuestions, signal });

      const parts = data.candidates?.[0]?.content?.parts || [];
      const contentPart = parts.find(p => !p.thought && p.text) || parts[parts.length - 1];
      let responseText = contentPart?.text;
      
      if (!responseText) return draftQuestions;
      responseText = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
      let parsed = JSON.parse(responseText);
      if (!Array.isArray(parsed) && parsed.questions && Array.isArray(parsed.questions)) {
        parsed = parsed.questions;
      }
      return (Array.isArray(parsed) ? parsed : []).map(normalizeQuestion).filter(Boolean);
    };


export { evaluateShortAnswerWithAi, draftQuizFromMaterial, reviseQuizDraft };
