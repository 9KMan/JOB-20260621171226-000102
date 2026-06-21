import { Router, Request, Response } from 'express';
import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditLog } from '../middleware/audit.js';
import { requireRole } from '../auth/rbac.js';

export const router = Router();

// GET /patients — return current user's patient record
router.get('/',
  requireRole('PATIENT', 'ADMIN'),
  auditLog('VIEW_OWN_PATIENT', 'Patient'),
  async (req: Request, res: Response) => {
    try {
      const patient = await prisma.patient.findUnique({
        where: { userId: req.user!.sub },
        include: { appointments: { take: 10, orderBy: { startTime: 'desc' } } },
      });
      if (!patient) {
        throw new AppError('Patient record not found', 404);
      }
      res.json(patient);
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      console.error('Get patient error:', err);
      res.status(500).json({ error: 'Failed to fetch patient record' });
    }
  }
);

// GET /patients/:id — ADMIN or assigned provider
router.get('/:id',
  requireRole('ADMIN', 'PROVIDER'),
  auditLog('VIEW_PATIENT', 'Patient'),
  async (req: Request, res: Response) => {
    try {
      if (req.user!.role === 'ADMIN') {
        const patient = await prisma.patient.findUnique({
          where: { id: req.params.id },
          include: { user: { select: { email: true } } },
        });
        if (!patient) throw new AppError('Patient not found', 404);
        res.json(patient);
        return;
      }
      // Provider — check assignment
      const appointment = await prisma.appointment.findFirst({
        where: { patientId: req.params.id, provider: { userId: req.user!.sub } },
      });
      if (!appointment) {
        throw new AppError('Not authorized to view this patient', 403);
      }
      const patient = await prisma.patient.findUnique({
        where: { id: req.params.id },
      });
      res.json(patient);
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      console.error('Get patient by id error:', err);
      res.status(500).json({ error: 'Failed to fetch patient' });
    }
  }
);
