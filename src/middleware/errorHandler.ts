/**
 * Centralized Error Handler Middleware
 * Handles Zod validation errors, known error types, and unexpected errors.
 * Never exposes internal error details to clients in production.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Global error handler middleware.
 * Must be registered last in the Express middleware chain.
 */
export function errorHandler(
  err: AppError | ZodError | Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isProduction = process.env.NODE_ENV === 'production';

  // ─── Zod Validation Error ─────────────────────────────────────────────────
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // ─── Custom App Error with status code ──────────────────────────────────
  if ('status' in err && typeof err.status === 'number') {
    res.status(err.status).json({
      error: err.message || 'Request failed',
    });
    return;
  }

  const message = err.message || '';

  // ─── Not Found ───────────────────────────────────────────────────────────
  if (message.toLowerCase().includes('not found')) {
    res.status(404).json({
      error: 'Resource not found',
    });
    return;
  }

  // ─── Unauthorized ────────────────────────────────────────────────────────
  if (message.toLowerCase().includes('unauthorized') || message.toLowerCase().includes('invalid credentials')) {
    res.status(401).json({
      error: 'Unauthorized',
    });
    return;
  }

  // ─── Forbidden ────────────────────────────────────────────────────────────
  if (message.toLowerCase().includes('forbidden') || message.toLowerCase().includes('not authorized')) {
    res.status(403).json({
      error: 'Forbidden',
    });
    return;
  }

  // ─── Conflict (duplicate, etc.) ──────────────────────────────────────────
  if (message.toLowerCase().includes('conflict') || message.toLowerCase().includes('already exists')) {
    res.status(409).json({
      error: 'Conflict',
    });
    return;
  }

  // ─── Default: Internal Server Error ──────────────────────────────────────
  console.error('[ERROR]', {
    name: err.name,
    message: err.message,
    stack: isProduction ? undefined : err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: isProduction ? 'Internal server error' : err.message,
  });
}

/**
 * Not Found handler for undefined routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`,
  });
}

/**
 * Async handler wrapper — catches async errors and passes to errorHandler
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
