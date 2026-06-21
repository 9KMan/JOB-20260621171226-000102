import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../config/database.js';
import { signAccessToken, signRefreshToken } from '../auth/jwt.js';
import { verifyMFAtoken, generateMFAsecret } from '../auth/mfa.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditLog } from '../middleware/audit.js';

export const router = Router();

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  role: z.enum(['PATIENT', 'PROVIDER', 'ADMIN']).default('PATIENT'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const mfaVerifySchema = z.object({
  email: z.string().email('Invalid email address'),
  token: z.string().length(6, 'MFA token must be 6 digits'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// POST /auth/register
router.post('/register',
  auditLog('REGISTER', 'User'),
  async (req: Request, res: Response) => {
    try {
      const body = registerSchema.parse(req.body);
      const { email, password, role } = body;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new AppError('User with this email already exists', 409);
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: { email, passwordHash, role },
        select: { id: true, email: true, role: true },
      });

      const accessToken = signAccessToken(user.id, user.role);
      const { token: refreshToken } = signRefreshToken(user.id);

      res.status(201).json({
        user,
        accessToken,
        refreshToken,
        mfaEnabled: false,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues });
        return;
      }
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      console.error('Register error:', err);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// POST /auth/login
router.post('/login',
  auditLog('LOGIN', 'User'),
  async (req: Request, res: Response) => {
    try {
      const body = loginSchema.parse(req.body);
      const { email, password } = body;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        throw new AppError('Invalid credentials', 401);
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        throw new AppError('Invalid credentials', 401);
      }

      // If MFA is set up, return partial auth requiring MFA verification
      if (user.mfaSecret) {
        res.json({
          requiresMfa: true,
          email: user.email,
          message: 'MFA verification required',
        });
        return;
      }

      const accessToken = signAccessToken(user.id, user.role);
      const { token: refreshToken } = signRefreshToken(user.id);

      res.json({
        user: { id: user.id, email: user.email, role: user.role },
        accessToken,
        refreshToken,
        mfaEnabled: false,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues });
        return;
      }
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// POST /auth/mfa-verify
router.post('/mfa-verify',
  auditLog('MFA_VERIFY', 'User'),
  async (req: Request, res: Response) => {
    try {
      const body = mfaVerifySchema.parse(req.body);
      const { email, token } = body;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        throw new AppError('Invalid credentials', 401);
      }

      if (!user.mfaSecret) {
        throw new AppError('MFA not enrolled for this user', 400);
      }

      const valid = verifyMFAtoken(user.mfaSecret, token);
      if (!valid) {
        throw new AppError('Invalid MFA token', 401);
      }

      const accessToken = signAccessToken(user.id, user.role);
      const { token: refreshToken } = signRefreshToken(user.id);

      res.json({
        user: { id: user.id, email: user.email, role: user.role },
        accessToken,
        refreshToken,
        mfaEnabled: true,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues });
        return;
      }
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      console.error('MFA verify error:', err);
      res.status(500).json({ error: 'MFA verification failed' });
    }
  }
);

// POST /auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const body = refreshSchema.parse(req.body);
    const { refreshToken } = body;

    // Verify token structure
    const { verifyToken } = await import('../auth/jwt.js');
    let payload;
    try {
      payload = verifyToken(refreshToken) as { sub: string; jti: string; type: string };
    } catch {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    if (payload.type !== 'refresh') {
      throw new AppError('Invalid token type', 401);
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new AppError('User not found', 401);
    }

    // Revoke the used refresh token (mark jti as revoked)
    const { revokeToken } = await import('../auth/jwt.js');
    await revokeToken(payload.jti);

    // Issue new access token
    const accessToken = signAccessToken(user.id, user.role);
    const { token: newRefreshToken } = signRefreshToken(user.id);

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.issues });
      return;
    }
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// POST /auth/logout
router.post('/logout',
  auditLog('LOGOUT', 'User'),
  async (req: Request, res: Response) => {
    try {
      const body = refreshSchema.parse(req.body);
      const { refreshToken } = body;

      if (!refreshToken) {
        res.json({ message: 'Logged out' });
        return;
      }

      // Verify and extract jti, then revoke
      try {
        const { verifyToken, revokeToken } = await import('../auth/jwt.js');
        const payload = verifyToken(refreshToken) as { jti: string; type: string };
        if (payload.type === 'refresh' && payload.jti) {
          await revokeToken(payload.jti);
        }
      } catch {
        // Token invalid — already logged out on client side
      }

      res.json({ message: 'Logged out successfully' });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues });
        return;
      }
      console.error('Logout error:', err);
      res.status(500).json({ error: 'Logout failed' });
    }
  }
);
