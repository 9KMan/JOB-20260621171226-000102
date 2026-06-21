# MedPortal — HIPAA-Compliant Patient Portal

> Production backend for a digital health company: secure patient portal, EHR integration, appointment scheduling, and provider messaging on AWS.

---

## Business Problem Solved

### The Challenge

A digital health company operating outpatient clinics needed a patient-facing portal handling **Protected Health Information (PHI)** under strict HIPAA compliance. The requirements included appointment scheduling, secure messaging between patients and providers, and integration with their existing athenahealth EHR system — with zero tolerance for data exposure.

Key constraints:
- HIPAA compliance non-negotiable: encryption at rest and in transit, comprehensive audit logging, role-based access control
- athenahealth integration via FHIR R4 endpoints for bidirectional EHR sync
- AWS infrastructure with proper IAM least-privilege, VPC isolation, and RDS encryption
- Multi-role system: patients, providers, and administrators with distinct permissions

### Our Solution

MedPortal is a HIPAA-compliant backend platform delivering:

1. **Secure Patient Portal** — JWT RS256 authentication with TOTP MFA, patient login, profile management, appointment viewing
2. **Appointment Scheduling** — Create, read, update appointments with provider assignment and status lifecycle
3. **Secure Messaging** — Thread-based encrypted messaging between patients and providers with AES-256-GCM at rest
4. **EHR Integration** — Full FHIR R4 sync with athenahealth: patients, appointments, conditions, medications, observations
5. **AWS Infrastructure** — VPC-isolated, RDS PostgreSQL with pgaudit, S3 with SSE-KMS encryption, Lambda workers, CloudTrail audit trail
6. **HIPAA Audit Layer** — Every PHI access logged with actor, action, resource, IP, user-agent, and timestamp; archived to S3 Glacier after 1 year

### Value Delivered

- **For Patients:** Self-service appointment management, secure direct messaging with providers, 24/7 portal access
- **For Providers:** Integrated schedule view synced with athenahealth, patient history before appointments
- **For Operations:** Complete PHI access audit trail, BAA-capable AWS infrastructure, SOC 2-ready architecture

---

## Tech Stack

- **Runtime:** Node.js 20+ with TypeScript (strict mode)
- **API Framework:** Express.js with Zod validation
- **Database:** PostgreSQL 15 with Prisma ORM + pgaudit extension
- **Auth:** JWT RS256 (asymmetric key pair), TOTP MFA via otplib, bcrypt password hashing
- **Encryption:** AES-256-GCM column-level encryption for all PHI fields (PHI helpers in `src/encryption/phi.ts`)
- **AWS:** Terraform IaC (VPC, RDS, S3, Lambda, IAM, KMS), SES/SNS for notifications
- **EHR:** FHIR R4 client for athenahealth REST API integration
- **Container:** Docker + docker-compose for local dev

---

## Project Structure

```
.
├── src/
│   ├── index.ts                    # App entry point, port bootstrap
│   ├── app.ts                      # Express app factory + middleware chain
│   ├── config/
│   │   ├── index.ts                # Env var loader + config singleton
│   │   └── database.ts             # Prisma client singleton (dev hot-reload safe)
│   ├── auth/
│   │   ├── jwt.ts                  # RS256 JWT sign/verify, access + refresh tokens
│   │   ├── mfa.ts                  # TOTP MFA: secret generation, QR enrollment, verify
│   │   └── rbac.ts                 # requireRole() middleware factory (PATIENT/PROVIDER/ADMIN)
│   ├── routes/
│   │   ├── auth.ts                 # POST /auth/register, /auth/login, /auth/mfa-verify, /auth/refresh, /auth/logout
│   │   ├── patients.ts             # GET /patients, GET /patients/:id (ownership enforced)
│   │   ├── appointments.ts         # GET/POST/PUT /appointments (role-scoped)
│   │   ├── messages.ts             # GET/POST /messages/threads, /messages/threads/:id
│   │   └── health.ts               # GET /health, GET /health/ready
│   ├── middleware/
│   │   ├── audit.ts                # HIPAA audit log on every PHI access
│   │   └── errorHandler.ts         # Global error handler, HIPAA-safe error messages
│   ├── audit/
│   │   └── logger.ts               # AuditLogger class: DB write + S3 Glacier batch flush
│   ├── encryption/
│   │   └── phi.ts                  # AES-256-GCM encrypt/decrypt helpers for PHI fields
│   ├── integration/
│   │   ├── athenahealth/
│   │   │   ├── fhir.ts             # FHIR R4 client: Patient, Appointment, Condition, MedicationRequest, Observation
│   │   │   └── webhook.ts          # Webhook processor: HMAC-SHA256 verify, idempotency guard
│   │   └── s3.ts                   # Presigned URL generation, virus scan trigger
│   └── workers/
│       └── notification.ts         # AWS SES email + SNS SMS appointment reminders
├── prisma/
│   ├── schema.prisma               # All models: User, Patient, Provider, Appointment, Message, AuditLog, FHIRMapping
│   └── migrations/
│       └── 001_initial_schema.sql  # Raw SQL: tables, indexes, pgaudit config, triggers
├── terraform/
│   ├── main.tf                     # VPC, subnets, NAT GW, RDS, S3, Lambda, IAM, KMS, security groups
│   ├── variables.tf                # All Terraform input variables
│   ├── outputs.tf                 # RDS endpoint, S3 bucket names, Lambda ARNs
│   └── terraform.tfvars.example   # Example variable values
├── .env.example                   # All env vars documented (no secrets)
├── .env.terraform.example         # AWS + athenahealth credentials template
├── package.json                   # Dependencies + npm scripts
├── tsconfig.json                  # TypeScript 5 strict config
├── Dockerfile                     # Multi-stage Node 20 build
├── docker-compose.yml             # API + PostgreSQL 15 with health checks
└── .gitignore                    # Node.js gitignore
```

---

## Features

### Authentication & Authorization
- RS256 JWT: asymmetric key pair, access token (15m) + refresh token (7d) with jti revocation
- TOTP MFA via otplib: secret generation, QR code enrollment, 6-digit token verification
- RBAC: three roles (PATIENT, PROVIDER, ADMIN) enforced via `requireRole()` middleware on every route
- Refresh token stored in DB with jti; logout revokes by marking revoked=true

### Patient Portal
- Patient registration and login with email verification flow
- View own appointments, message threads, and profile
- Request new appointments with provider and time slot selection
- Provider-only: view assigned patient list; Admin: full cross-provider access

### Secure Messaging
- Thread-based messaging: patient initiates a thread, provider responds
- Message content encrypted with AES-256-GCM before storage (client-side encryption)
- Threads scoped to patient–provider relationships

### Appointment Scheduling
- Full lifecycle: SCHEDULED → CONFIRMED → IN_PROGRESS → COMPLETED | CANCELLED | NO_SHOW
- Patient-initiated booking; provider updates status
- athenahealth appointment ID mapping via FHIRMapping table

### EHR Integration (athenahealth FHIR R4)
- Bidirectional sync: internal UUID ↔ athenahealth IDs mapped in FHIRMapping table
- Resources: Patient, Appointment, Condition, MedicationRequest, Observation
- OAuth2 client credentials flow for server-to-server API access
- Webhook receiver: HMAC-SHA256 signature verification, idempotency via event deduplication

### HIPAA Compliance Layer
- **Encryption at rest:** AES-256-GCM on all PHI columns (Patient, Provider firstName/lastName, DOB, phone; Message content)
- **Encryption in transit:** HTTPS/TLS 1.2+ enforced; S3 SSE-KMS; RDS SSL required
- **Audit logging:** Every PHI access logged: userId, action, resourceType, resourceId, IP, user-agent, timestamp, success flag; stored in PostgreSQL + archived to S3 Glacier after 1 year
- **Access control:** RBAC on every endpoint; patient data isolated to owning patient and assigned provider
- **BAA-ready:** AWS RDS, S3, Lambda deployed under VPC with VPC endpoints; no public IP on database

### AWS Infrastructure (Terraform)
- VPC with public (ALB), private app (Lambda, ECS), and private data (RDS) subnets across 3 AZs
- RDS PostgreSQL 15: encrypted (KMS), multi-AZ in prod, pgaudit extension, 30-day backups
- S3 documents bucket: SSE-KMS encryption, versioning, 90-day → Glacier lifecycle
- S3 audit logs bucket: SSE-KMS, Deep Archive after 1 year (immutable)
- Lambda functions: EHR webhook processor, audit log flush to S3 Glacier
- IAM least-privilege: Lambda execution role, RDS access scoped to app security group
- KMS key with rotation enabled

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for local database)
- AWS CLI configured (for Terraform)
- athenahealth API credentials (for EHR integration)

### 1. Clone & Install

```bash
git clone https://github.com/9KMan/JOB-20260621171226-000102.git
cd JOB-20260621171226-000102
npm install
```

### 2. Environment Variables

Create `.env` from the example:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://medportal_admin:***@localhost:5432/medportal` |
| `JWT_PUBLIC_KEY` | RS256 public key (PEM or base64) | `LS0tLS1...` |
| `JWT_PRIVATE_KEY` | RS256 private key (PEM or base64) | `LS0tLS1...` |
| `JWT_ACCESS_TTL` | Access token TTL | `15m` |
| `JWT_REFRESH_TTL` | Refresh token TTL | `7d` |
| `ENCRYPTION_KEY` | 64-char hex master key for PHI encryption | `aabbccdd...` |
| `AWS_REGION` | AWS region | `us-east-1` |
| `S3_BUCKET_NAME` | S3 documents bucket name | `medportal-documents-dev` |
| `ATHENA_CLIENT_ID` | athenahealth OAuth client ID | `xxxxx` |
| `ATHENA_CLIENT_SECRET` | athenahealth OAuth client secret | `xxxxx` |
| `ATHENA_WEBHOOK_SECRET` | athenahealth webhook HMAC secret | `xxxxx` |
| `CORS_ORIGIN` | Allowed CORS origin | `https://portal.example.com` |
| `NODE_ENV` | `development` or `production` | `development` |
| `PORT` | API server port | `3000` |

### 3. Start Database

```bash
docker compose up -d db
```

Wait for PostgreSQL to be ready (~5s), then run migrations:

```bash
npx prisma migrate deploy
```

### 4. Generate RSA Key Pair

```bash
# Generate 2048-bit RSA key pair
openssl genrsa -out jwt_private.pem 2048
openssl rsa -in jwt_private.pem -pubout -out jwt_public.pem

# Add to .env:
# JWT_PRIVATE_KEY=$(cat jwt_private.pem | base64 -w0)
# JWT_PUBLIC_KEY= $(cat jwt_public.pem  | base64 -w0)
```

### 5. Start API

```bash
npm run dev
```

API server runs at `http://localhost:3000`. Health check:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
```

### 6. Deploy Infrastructure

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
terraform init
terraform plan
terraform apply
```

---

## API Endpoints

### Auth
| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Register new user (patient/provider/admin) |
| `POST` | `/auth/login` | Login, returns access + refresh tokens |
| `POST` | `/auth/mfa-verify` | Verify TOTP token, upgrade session to MFA-verified |
| `POST` | `/auth/refresh` | Exchange refresh token for new access token |
| `POST` | `/auth/logout` | Revoke refresh token |

### Patients
| Method | Path | Description |
|---|---|---|
| `GET` | `/patients` | Get current user's patient record (PATIENT, ADMIN) |
| `GET` | `/patients/:id` | Get patient by ID (ADMIN or assigned PROVIDER only) |

### Appointments
| Method | Path | Description |
|---|---|---|
| `GET` | `/appointments` | List appointments (role-scoped: patient sees own, provider sees assigned) |
| `POST` | `/appointments` | Create appointment (PATIENT, ADMIN) |
| `PUT` | `/appointments/:id` | Update appointment status/notes (PROVIDER, ADMIN) |

### Messages
| Method | Path | Description |
|---|---|---|
| `GET` | `/messages/threads` | List message threads (role-scoped) |
| `POST` | `/messages/threads` | Create new message thread (PATIENT, ADMIN) |
| `GET` | `/messages/threads/:id` | Get messages in thread (participant only) |
| `POST` | `/messages/threads/:id` | Send encrypted message (PATIENT, PROVIDER, ADMIN) |

### Health
| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe |
| `GET` | `/health/ready` | Readiness probe (DB connectivity check) |

---

## Database Schema

**Core tables:** `users`, `refresh_tokens`, `patients`, `providers`, `appointments`, `message_threads`, `messages`, `audit_logs`, `fhir_mappings`

All PHI fields are encrypted at the application layer before storage. The database stores only ciphertext. The `ENCRYPTION_KEY` environment variable never leaves the application tier.

Prisma manages migrations in `prisma/migrations/`. Raw SQL with pgaudit configuration in `prisma/migrations/001_initial_schema.sql`.

---

## Security & Compliance Notes

- **No PHI in logs:** Audit log `details` field is JSON stringified; if it contains PHI it must be encrypted before DB write
- **MFA required for providers and admins:** Enforced at registration; patients optional
- **Token revocation:** Refresh tokens tracked in DB with `revoked` flag and `jti`; access tokens short-lived (15m)
- **Audit log retention:** PostgreSQL operational; S3 Glacier archive after 365 days for HIPAA long-term retention
- **BAA required before production:** AWS provides BAA for RDS, S3, Lambda, KMS; confirm scope with your compliance team

---

Built by: KMan | AI-Augmented Engineering Factory
