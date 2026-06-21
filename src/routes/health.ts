import { Router, Request, Response } from 'express';
import prisma from '../config/database.js';

export const router = Router();

// GET /health — basic liveness check
router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'medportal-api',
  });
});

// GET /health/ready — readiness check (DB connectivity)
router.get('/ready', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'not ready', database: 'disconnected' });
  }
});
