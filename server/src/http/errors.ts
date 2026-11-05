import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: error.issues.map((i) => i.message).join('; ') },
    });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
    res
      .status(413)
      .json({ error: { code: 'FILE_TOO_LARGE', message: 'Choose a file smaller than 20 MB.' } });
    return;
  }
  console.error('[request failed]', error instanceof Error ? error.name : 'UnknownError');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'The request could not be completed. Your confirmed edits have been preserved.',
    },
  });
};
