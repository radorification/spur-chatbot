import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const parseError = err as Error & {
    type?: string;
    status?: number;
    body?: unknown;
  };

  if (parseError.type === 'entity.parse.failed') {
    res.status(400).json({
      error: 'Invalid JSON body.',
    });
    return;
  }

  if (parseError.type === 'entity.too.large' || parseError.status === 413) {
    res.status(413).json({
      error: 'Request body too large.',
    });
    return;
  }

  console.error('[Unhandled Error]', err.message);
  res.status(500).json({
    error: 'An unexpected server error occurred. Please try again.',
  });
}
