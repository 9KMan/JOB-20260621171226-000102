---
GSD: true
phase: 2-technical-stack
plan: PLAN-01
status: IMPLEMENTATION
created: 2026-06-21T17:12:26Z
---

# Phase 02: Technical Stack — IMPLEMENTATION PLAN

## Phase Goal
Select and justify the technology stack, frameworks, and tools, then scaffold all project configuration files.

## Tech Stack
- **Runtime:** Node.js 20 LTS
- **Language:** TypeScript 5.x
- **Web Framework:** Express.js 4.x
- **Database:** PostgreSQL 15 with `pg` driver
- **ORM:** Prisma 5.x
- **Validation:** express-validator 7.x
- **Security:** helmet 7.x, cors 2.8.x, bcryptjs 2.4.x
- **Auth:** jsonwebtoken 9.x
- **AI/External:** openai 4.x, stripe 14.x
- **Dev/Build:** ts-node, typescript, @types/* packages

## Dependencies

Install the following production and development packages:

```bash
# Production
npm install express cors dotenv pg @prisma/client express-validator helmet \
  cors jsonwebtoken bcryptjs uuid stripe openai

# Development
npm install -D typescript ts-node @types/node @types/express @types/cors \
  @types/jsonwebtoken @types/bcryptjs @types/uuid prisma nodemon
```

Key `package.json` values:
```json
{
  "name": "tuinui-api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "nodemon --exec ts-node --files src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "pg": "^8.11.3",
    "@prisma/client": "^5.7.0",
    "express-validator": "^7.0.1",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "uuid": "^9.0.1",
    "stripe": "^14.8.0",
    "openai": "^4.20.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "ts-node": "^10.9.2",
    "nodemon": "^3.0.2",
    "@types/node": "^20.10.0",
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/bcryptjs": "^2.4.6",
    "@types/uuid": "^9.0.7",
    "prisma": "^5.7.0"
  }
}
```

## Environment Config

All required environment variables (`.env.example`):

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/tuinui

# Application
NODE_ENV=development
PORT=8080
LOG_LEVEL=info

# Auth
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=7d

# External Services
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional: GCP / Cloud Storage
GCP_PROJECT_ID=
GCP_STORAGE_BUCKET=
```

## TypeScript Config

`tsconfig.json` key settings:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Docker Setup

### Dockerfile (Node.js 20 LTS multi-stage)

```dockerfile
# Build stage
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
RUN npx prisma generate
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
USER node
CMD ["node", "dist/server.js"]
```

### docker-compose.yml

```yaml
version: "3.9"

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: tuinui-api
    ports:
      - "${PORT:-8080}:8080"
    environment:
      - NODE_ENV=${NODE_ENV:-development}
      - DATABASE_URL=${DATABASE_URL}
      - PORT=${PORT:-8080}
      - JWT_SECRET=${JWT_SECRET}
      - JWT_EXPIRES_IN=${JWT_EXPIRES_IN}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
      - GCP_PROJECT_ID=${GCP_PROJECT_ID}
      - GCP_STORAGE_BUCKET=${GCP_STORAGE_BUCKET}
    volumes:
      - ./src:/app/src
      - ./prisma:/app/prisma
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:15-alpine
    container_name: tuinui-db
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=tuinui
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d tuinui"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:

networks:
  default:
    name: tuinui-network
```

## Done When
- [ ] `package.json` created with all dependencies listed
- [ ] `tsconfig.json` created with strict TypeScript configuration
- [ ] `.env.example` created with all required environment variables
- [ ] `Dockerfile` created with multi-stage Node.js 20 build
- [ ] `docker-compose.yml` created with api + postgres services
- [ ] `.gitignore` created for Node.js/TypeScript projects
- [ ] All files committed and pushed to `origin master`

## Files to Create

| File | Purpose |
|------|---------|
| `package.json` | NPM package manifest with all dependencies and scripts |
| `tsconfig.json` | TypeScript configuration with strict mode enabled |
| `.env.example` | Environment variable template for local development |
| `Dockerfile` | Multi-stage Docker build for Node.js 20 production image |
| `docker-compose.yml` | Docker Compose orchestration with API + PostgreSQL |
| `.gitignore` | Git ignore patterns for Node.js/TypeScript development |
