/**
 * RBAC Middleware — Role-Based Access Control for Express
 * Extracts JWT from Authorization header, verifies, and checks role.
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken, AccessTokenPayload } from './jwt.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export type UserRole = 'PATIENT' | 'PROVIDER' | 'ADMIN' | 'SYSTEM';

/**
 * Middleware factory that requires one of the specified roles.
 * Returns 403 if role check fails.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    try {
      const payload = verifyToken(token) as AccessTokenPayload;

      if (payload.type !== 'access') {
        res.status(401).json({ error: 'Invalid token type — access token required' });
        return;
      }

      if (!allowedRoles.includes(payload.role as UserRole)) {
        res.status(403).json({
          error: 'Insufficient permissions',
          required: allowedRoles,
          actual: payload.role,
        });
        return;
      }

      // Attach user to request for downstream handlers
      req.user = payload;
      next();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Token verification failed';
      res.status(401).json({ error: message });
    }
  };
}

/**
 * Optional auth middleware — attaches user if token present, but doesn't require it.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token) as AccessTokenPayload;
    if (payload.type === 'access') {
      req.user = payload;
    }
  } catch {
    // Ignore invalid tokens for optional auth
  }

  next();
}
