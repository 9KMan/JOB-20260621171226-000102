import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import patientsRouter from './routes/patients.js';
import appointmentsRouter from './routes/appointments.js';
import messagesRouter from './routes/messages.js';

export function createApp(): Express {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());

  // Performance middleware
  app.use(compression());
  app.use(express.json());

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Routes
  app.use('/health', healthRouter);
  app.use('/auth', authRouter);
  app.use('/patients', patientsRouter);
  app.use('/appointments', appointmentsRouter);
  app.use('/messages', messagesRouter);

  // Global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
