import { Request, Response, NextFunction } from 'express';
import { verifyToken, AccessTokenPayload } from './jwt.js';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      _res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.slice(7);
    try {
      const payload = verifyToken(token) as AccessTokenPayload;
      if (payload.type !== 'access') {
        _res.status(401).json({ error: 'Invalid token type' });
        return;
      }
      if (!roles.includes(payload.role)) {
        _res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      req.user = payload;
      next();
    } catch (err) {
      _res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}
