import { Response } from 'express';

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly resetsAt?: string;
  public readonly details?: unknown;

  constructor(options: {
    code: string;
    message: string;
    statusCode?: number;
    resetsAt?: string;
    details?: unknown;
  }) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode || 400;
    this.resetsAt = options.resetsAt;
    this.details = options.details;
  }
}

export function sendError(res: Response, error: unknown): Response {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        resetsAt: error.resetsAt,
        details: error.details
      }
    });
  }

  const message = error instanceof Error ? error.message : 'حدث خطأ غير متوقع في الخادم';
  console.error('Unhandled server error:', error);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message
    }
  });
}
