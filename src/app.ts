import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): Express {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  }));

  // Compression
  app.use(compression());

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });
  app.use('/api/', limiter);

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Trust proxy (for correct IP behind load balancer)
  app.set('trust proxy', 1);

  // Routes
  app.use('/health', healthRouter);
  app.use('/auth', authRouter);
  app.use('/patients', patientsRouter);
  app.use('/appointments', appointmentsRouter);
  app.use('/messages', messagesRouter);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Global error handler
  app.use(errorHandler);

  return app;
}

// Placeholder imports — replace with real routes after Phase 5
import { router as healthRouter } from './routes/health.js';
import { router as authRouter } from './routes/auth.js';
import { router as patientsRouter } from './routes/patients.js';
import { router as appointmentsRouter } from './routes/appointments.js';
import { router as messagesRouter } from './routes/messages.js';
