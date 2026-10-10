import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { query } from '../db/pool.js';
import { sendError, AppError } from '../lib/errors.js';
import { Material, Question } from '@fast-learning/shared';

const router = Router();

// GET /api/materials
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const materialRows = await query<any[]>(
      `SELECT m.id, m.user_id, m.title, m.source_type, m.source_name,
              m.content_preview, m.question_count, m.created_at, m.updated_at
       FROM materials m
       WHERE m.user_id = ? AND m.deleted_at IS NULL
       ORDER BY m.updated_at DESC`,
      [userId]
    );

    // Fetch latest attempt for each material
    const materialsWithAttempt: Material[] = [];

    for (const row of materialRows) {
      const attemptRows = await query<any[]>(
        `SELECT id, user_id, material_id, mode, status, question_order,
                answers, current_index, score, started_at, updated_at, completed_at
         FROM quiz_attempts
         WHERE material_id = ? AND user_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`,
        [row.id, userId]
      );

      const latestAttempt = attemptRows.length > 0 ? {
        ...attemptRows[0],
        question_order: typeof attemptRows[0].question_order === 'string'
          ? JSON.parse(attemptRows[0].question_order)
          : attemptRows[0].question_order,
        answers: typeof attemptRows[0].answers === 'string'
          ? JSON.parse(attemptRows[0].answers)
          : attemptRows[0].answers
      } : null;

      materialsWithAttempt.push({
        ...row,
        questions: [], // omit heavy question bodies in list view
        deleted_at: null,
        latestAttempt
      });
    }

    res.json(materialsWithAttempt);
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/materials
const createMaterialSchema = z.object({
  title: z.string().min(1).max(255),
  source_type: z.enum(['text', 'file', 'image', 'mixed']).default('text'),
  source_name: z.string().default(''),
  content_preview: z.string().default(''),
  questions: z.array(z.object({
    id: z.union([z.string(), z.number()]),
    question: z.string(),
    options: z.array(z.string()),
    correct_index: z.number(),
    explanation: z.string().default(''),
    mnemonic: z.string().default('')
  })).min(1, 'يجب أن تحتوي المادة على سؤال واحد على الأقل')
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = createMaterialSchema.parse(req.body);
    const userId = req.user!.id;

    const questionsJson = JSON.stringify(data.questions);
    const count = data.questions.length;
    const preview = data.content_preview || data.questions[0].question.slice(0, 150);

    const result = await query<any>(
      `INSERT INTO materials (user_id, title, source_type, source_name, content_preview, questions, question_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, data.title, data.source_type, data.source_name, preview, questionsJson, count]
    );

    const insertId = result.insertId;
    const [inserted] = await query<any[]>(
      'SELECT * FROM materials WHERE id = ?',
      [insertId]
    );

    res.status(201).json({
      ...inserted[0],
      questions: data.questions
    });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/materials/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const materialId = Number(req.params.id);
    const userId = req.user!.id;

    const rows = await query<any[]>(
      'SELECT * FROM materials WHERE id = ? AND deleted_at IS NULL',
      [materialId]
    );

    if (rows.length === 0) {
      throw new AppError({
        code: 'MATERIAL_NOT_FOUND',
        message: 'المادة التعليمية غير موجودة',
        statusCode: 404
      });
    }

    const material = rows[0];
    // Check ownership
    if (material.user_id !== userId && req.user!.role !== 'admin') {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'ليس لديك صلاحية الوصول لهذه المادة',
        statusCode: 403
      });
    }

    const parsedQuestions = typeof material.questions === 'string'
      ? JSON.parse(material.questions)
      : material.questions;

    res.json({
      ...material,
      questions: parsedQuestions
    });
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/materials/:id
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const materialId = Number(req.params.id);
    const userId = req.user!.id;

    const rows = await query<any[]>(
      'SELECT user_id FROM materials WHERE id = ? AND deleted_at IS NULL',
      [materialId]
    );

    if (rows.length === 0) {
      throw new AppError({
        code: 'MATERIAL_NOT_FOUND',
        message: 'المادة التعليمية غير موجودة',
        statusCode: 404
      });
    }

    if (rows[0].user_id !== userId && req.user!.role !== 'admin') {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'ليس لديك صلاحية حذف هذه المادة',
        statusCode: 403
      });
    }

    await query(
      'UPDATE materials SET deleted_at = NOW() WHERE id = ?',
      [materialId]
    );

    res.json({ success: true, message: 'تم حذف المادة بنجاح' });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
