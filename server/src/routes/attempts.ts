import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { query } from '../db/pool.js';
import { sendError, AppError } from '../lib/errors.js';
import { QuizAttempt } from '@fast-learning/shared';

const router = Router();

// GET /api/attempts/resume?materialId=&mode=
router.get('/resume', requireAuth, async (req: Request, res: Response) => {
  try {
    const materialId = Number(req.query.materialId);
    const mode = (req.query.mode as string) || 'quiz';
    const userId = req.user!.id;

    if (!materialId) {
      throw new AppError({
        code: 'MISSING_PARAM',
        message: 'معرّف المادة (materialId) مطلوب للاستئناف',
        statusCode: 400
      });
    }

    const rows = await query<any[]>(
      `SELECT * FROM quiz_attempts
       WHERE user_id = ? AND material_id = ? AND mode = ? AND status = 'in_progress'
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId, materialId, mode]
    );

    if (rows.length === 0) {
      return res.json({ attempt: null });
    }

    const attempt = rows[0];
    res.json({
      attempt: {
        ...attempt,
        question_order: typeof attempt.question_order === 'string'
          ? JSON.parse(attempt.question_order)
          : attempt.question_order,
        answers: typeof attempt.answers === 'string'
          ? JSON.parse(attempt.answers)
          : attempt.answers
      }
    });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/attempts
const startAttemptSchema = z.object({
  material_id: z.number(),
  mode: z.enum(['learn', 'quiz']),
  question_order: z.array(z.number())
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { material_id, mode, question_order } = startAttemptSchema.parse(req.body);
    const userId = req.user!.id;

    // Check material ownership
    const matRows = await query<any[]>(
      'SELECT user_id FROM materials WHERE id = ? AND deleted_at IS NULL',
      [material_id]
    );

    if (matRows.length === 0) {
      throw new AppError({
        code: 'MATERIAL_NOT_FOUND',
        message: 'المادة غير موجودة',
        statusCode: 404
      });
    }

    if (matRows[0].user_id !== userId && req.user!.role !== 'admin') {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'لا تملك هذه المادة',
        statusCode: 403
      });
    }

    // Insert new in_progress attempt
    const result = await query<any>(
      `INSERT INTO quiz_attempts (user_id, material_id, mode, status, question_order, answers, current_index, score)
       VALUES (?, ?, ?, 'in_progress', ?, '{}', 0, 0)`,
      [userId, material_id, mode, JSON.stringify(question_order)]
    );

    const [rows] = await query<any[]>(
      'SELECT * FROM quiz_attempts WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      ...rows[0],
      question_order,
      answers: {}
    });
  } catch (err) {
    sendError(res, err);
  }
});

// PATCH /api/attempts/:id
const updateAttemptSchema = z.object({
  current_index: z.number().optional(),
  answers: z.record(z.any()).optional(),
  score: z.number().optional(),
  status: z.enum(['in_progress', 'completed', 'abandoned']).optional()
});

router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const attemptId = Number(req.params.id);
    const userId = req.user!.id;
    const data = updateAttemptSchema.parse(req.body);

    const existingRows = await query<any[]>(
      'SELECT * FROM quiz_attempts WHERE id = ?',
      [attemptId]
    );

    if (existingRows.length === 0) {
      throw new AppError({
        code: 'ATTEMPT_NOT_FOUND',
        message: 'محاولة الاختبار غير موجودة',
        statusCode: 404
      });
    }

    const attempt = existingRows[0];
    if (attempt.user_id !== userId && req.user!.role !== 'admin') {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'لا تملك هذه المحاولة',
        statusCode: 403
      });
    }

    const isCompleted = data.status === 'completed';

    await query(
      `UPDATE quiz_attempts
       SET current_index = COALESCE(?, current_index),
           answers = COALESCE(?, answers),
           score = COALESCE(?, score),
           status = COALESCE(?, status),
           completed_at = CASE WHEN ? THEN NOW() ELSE completed_at END,
           updated_at = NOW()
       WHERE id = ?`,
      [
        data.current_index ?? null,
        data.answers ? JSON.stringify(data.answers) : null,
        data.score ?? null,
        data.status ?? null,
        isCompleted ? 1 : 0,
        attemptId
      ]
    );

    const [updatedRows] = await query<any[]>(
      'SELECT * FROM quiz_attempts WHERE id = ?',
      [attemptId]
    );

    res.json({
      ...updatedRows[0],
      question_order: typeof updatedRows[0].question_order === 'string'
        ? JSON.parse(updatedRows[0].question_order)
        : updatedRows[0].question_order,
      answers: typeof updatedRows[0].answers === 'string'
        ? JSON.parse(updatedRows[0].answers)
        : updatedRows[0].answers
    });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
