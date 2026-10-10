import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { reserveAiUnits, finalizeAiUnits, refundAiUnits } from '../quota/usage.js';
import { resolveApiKeyForUser, validateModel } from '../ai/gemini.js';
import { executeGenerateQuiz } from '../ai/tasks/generateQuiz.js';
import { executeEvaluateAnswer } from '../ai/tasks/evaluateAnswer.js';
import { executeTts } from '../ai/tasks/tts.js';
import { sendError, AppError } from '../lib/errors.js';
import { query } from '../db/pool.js';
import { sha256 } from '../lib/crypto.js';

const router = Router();

// POST /api/ai/generate-quiz
const generateQuizSchema = z.object({
  title: z.string().optional(),
  text: z.string().min(10, 'النص التعليمي قصير جداً').max(250000),
  questionCount: z.coerce.number().min(1).max(50).default(10),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  language: z.string().default('auto'),
  model: z.string().optional(),
  sourceName: z.string().optional(),
  sourceType: z.enum(['text', 'file', 'image', 'mixed']).default('text')
});

router.post('/generate-quiz', requireAuth, async (req: Request, res: Response) => {
  let usageId: number | null = null;
  try {
    const data = generateQuizSchema.parse(req.body);
    const user = req.user!;
    const model = validateModel(data.model);

    // 1. Reserve 5 units
    usageId = await reserveAiUnits({
      userId: user.id,
      task: 'generate_quiz',
      units: 5,
      model
    });

    // 2. Resolve server key (dedicated > pool > env)
    const keyInfo = await resolveApiKeyForUser(user);

    // 3. Execute Quiz Generation
    const generated = await executeGenerateQuiz(keyInfo.apiKey, model, data);

    // 4. Finalize usage
    await finalizeAiUnits(usageId);

    res.json(generated);
  } catch (err) {
    if (usageId !== null) {
      await refundAiUnits(usageId).catch(() => {});
    }
    sendError(res, err);
  }
});

// POST /api/ai/evaluate-answer
const evaluateSchema = z.object({
  question: z.string().min(1),
  correctAnswer: z.string().min(1),
  studentAnswer: z.string().min(1),
  language: z.string().optional(),
  model: z.string().optional()
});

router.post('/evaluate-answer', requireAuth, async (req: Request, res: Response) => {
  let usageId: number | null = null;
  try {
    const data = evaluateSchema.parse(req.body);
    const user = req.user!;
    const model = validateModel(data.model);

    // 1. Reserve 1 unit
    usageId = await reserveAiUnits({
      userId: user.id,
      task: 'evaluate_answer',
      units: 1,
      model
    });

    // 2. Resolve key
    const keyInfo = await resolveApiKeyForUser(user);

    // 3. Execute Evaluation
    const result = await executeEvaluateAnswer(keyInfo.apiKey, model, data);

    // 4. Finalize
    await finalizeAiUnits(usageId);

    res.json(result);
  } catch (err) {
    if (usageId !== null) {
      await refundAiUnits(usageId).catch(() => {});
    }
    sendError(res, err);
  }
});

// POST /api/ai/tts
const ttsSchema = z.object({
  text: z.string().min(1).max(5000),
  voice: z.string().optional(),
  language: z.string().optional(),
  model: z.string().optional()
});

router.post('/tts', requireAuth, async (req: Request, res: Response) => {
  let usageId: number | null = null;
  try {
    const data = ttsSchema.parse(req.body);
    const user = req.user!;
    const model = validateModel(data.model);
    const voice = data.voice || 'ar-XA-Standard-A';

    // 1. Fast Cache Check - 0 units cost if cached!
    const cacheKey = sha256(`${data.text.trim()}:${voice}:${model}`);
    const cachedRows = await query<any[]>(
      'SELECT audio, mime_type FROM tts_cache WHERE hash = ?',
      [cacheKey]
    );

    if (cachedRows.length > 0) {
      const row = cachedRows[0];
      const base64Audio = Buffer.isBuffer(row.audio)
        ? row.audio.toString('base64')
        : Buffer.from(row.audio).toString('base64');

      return res.json({
        audioBase64: base64Audio,
        mimeType: row.mime_type || 'audio/mp3',
        cached: true
      });
    }

    // 2. Reserve Units: 1 unit per 500 characters
    const units = Math.max(1, Math.ceil(data.text.length / 500));
    usageId = await reserveAiUnits({
      userId: user.id,
      task: 'tts',
      units,
      model
    });

    // 3. Resolve key
    const keyInfo = await resolveApiKeyForUser(user);

    // 4. Execute TTS
    const result = await executeTts(keyInfo.apiKey, model, data);

    // 5. Finalize
    await finalizeAiUnits(usageId);

    res.json(result);
  } catch (err) {
    if (usageId !== null) {
      await refundAiUnits(usageId).catch(() => {});
    }
    sendError(res, err);
  }
});

export default router;
