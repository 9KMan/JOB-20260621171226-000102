---
GSD: true
phase: 3-architecture
plan: 01
status: implementation
---

# Phase 03: Architecture — Implementation Plan

## Phase Goal
Implement the Express.js application foundation with middleware chain, configuration management, health check endpoint, and Prisma database integration.

## Files to Create

The following source files implement the architecture:

- `src/index.ts` — Application entry point; bootstraps Express server
- `src/app.ts` — Express app factory; defines middleware chain
- `src/config/index.ts` — Configuration loader; reads from environment variables
- `src/config/database.ts` — Prisma client singleton and database connection
- `src/routes/health.ts` — Health check endpoint for liveness/readiness probes

---

## Implementation Details

### `src/config/index.ts`

```typescript
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  databaseUrl: process.env.DATABASE_URL ?? '',
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
```

**How to implement:** Use `dotenv` to load `.env` file at startup. Export a single `config` object with typed fields reading from `process.env`, providing sensible defaults. This keeps all env access in one place.

---

### `src/config/database.ts`

```typescript
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prisma = global.prisma ?? new PrismaClient({
  log: ['query', 'warn', 'error'],
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export { prisma };
```

**How to implement:** Create a Prisma client singleton to prevent multiple connections in development hot-reload. Use `global` declaration to persist across module reloads. Export the `prisma` instance for use in routes and services. Configure log levels conditionally based on environment.

---

### `src/routes/health.ts`

```typescript
import { Router, Request, Response } from 'express';
import { prisma } from '../config/database.js';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: 'database unreachable' });
  }
});

export default router;
```

**How to implement:** Create an Express Router with a `/health` GET handler. Perform a lightweight database query to verify connectivity, returning JSON with status and timestamp on success or 503 on failure. This serves as both liveness and readiness probe.

---

### `src/app.ts`

```typescript
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import healthRouter from './routes/health.js';

export function createApp(): Express {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));

  // Performance middleware
  app.use(compression());
  app.use(express.json());

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Routes
  app.use('/', healthRouter);

  return app;
}
```

**How to implement:** Build a `createApp()` factory that returns a new Express instance. Chain middleware in this order: Helmet (security headers), CORS (cross-origin requests), compression (gzip response), `express.json()` (body parsing), then rate limiting. Mount the health router at root. Keep the function pure so it can be tested in isolation.

---

### `src/index.ts`

```typescript
import { createApp } from './app.js';
import { config } from './config/index.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
});
```

**How to implement:** Import the app factory and config. Call `createApp()` to get the Express instance. Invoke `.listen()` with the configured port. Log startup message. This is the only file that should call Node.js `listen()`.

---

## Done When

- All 5 files listed above exist and export the described symbols
- `src/app.ts` exports `createApp()` returning an Express instance
- `src/config/index.ts` exports a `config` object with all fields
- `src/config/database.ts` exports a `prisma` singleton
- `src/routes/health.ts` exports a default Router with `/health` handler
- TypeScript compiles without errors (`tsc --noEmit`)
- Project structure reflects the architecture plan
