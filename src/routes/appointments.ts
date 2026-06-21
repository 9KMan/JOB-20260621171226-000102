import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditLog } from '../middleware/audit.js';
import { requireRole } from '../auth/rbac.js';

export const router = Router();

const createAppointmentSchema = z.object({
  patientId: z.string().uuid(),
  providerId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  type: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/',
  requireRole('PATIENT', 'PROVIDER', 'ADMIN'),
  auditLog('LIST_APPOINTMENTS', 'Appointment'),
  async (req: Request, res: Response) => {
    try {
      let appointments;
      if (req.user!.role === 'PATIENT') {
        const patient = await prisma.patient.findUnique({ where: { userId: req.user!.sub } });
        if (!patient) throw new AppError('Patient not found', 404);
        appointments = await prisma.appointment.findMany({
          where: { patientId: patient.id },
          include: { provider: true, patient: true },
          orderBy: { startTime: 'asc' },
        });
      } else if (req.user!.role === 'PROVIDER') {
        const provider = await prisma.provider.findUnique({ where: { userId: req.user!.sub } });
        if (!provider) throw new AppError('Provider not found', 404);
        appointments = await prisma.appointment.findMany({
          where: { providerId: provider.id },
          include: { patient: true, provider: true },
          orderBy: { startTime: 'asc' },
        });
      } else {
        appointments = await prisma.appointment.findMany({
          include: { patient: true, provider: true },
          orderBy: { startTime: 'asc' },
        });
      }
      res.json(appointments);
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      console.error('List appointments error:', err);
      res.status(500).json({ error: 'Failed to list appointments' });
    }
  }
);

router.post('/',
  requireRole('PATIENT', 'ADMIN'),
  auditLog('CREATE_APPOINTMENT', 'Appointment'),
  async (req: Request, res: Response) => {
    try {
      const data = createAppointmentSchema.parse(req.body);
      const appointment = await prisma.appointment.create({
        data: {
          patientId: data.patientId,
          providerId: data.providerId,
          startTime: new Date(data.startTime),
          endTime: new Date(data.endTime),
          type: data.type,
          notes: data.notes,
        },
        include: { patient: true, provider: true },
      });
      res.status(201).json(appointment);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues });
        return;
      }
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      console.error('Create appointment error:', err);
      res.status(500).json({ error: 'Failed to create appointment' });
    }
  }
);

router.put('/:id',
  requireRole('PROVIDER', 'ADMIN'),
  auditLog('UPDATE_APPOINTMENT', 'Appointment'),
  async (req: Request, res: Response) => {
    try {
      const { status, notes } = req.body;
      const appointment = await prisma.appointment.update({
        where: { id: req.params.id },
        data: { status, notes },
        include: { patient: true, provider: true },
      });
      res.json(appointment);
    } catch (err) {
      console.error('Update appointment error:', err);
      res.status(500).json({ error: 'Failed to update appointment' });
    }
  }
);
