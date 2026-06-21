---
GSD: true
phase: 4-data-model
plan: 01
status: IMPLEMENTATION
created: 2026-06-21
---

# Phase 04: Data Model — Implementation Plan

## Phase Goal

Implement the Prisma schema for all core entities: User, Patient, Provider, Appointment, Message, AuditLog, RefreshToken, and FHIR resource mapping tables. This is the foundation for all downstream code.

## Context

HIPAA requires that PHI fields (name, DOB, phone, message content) be encrypted at rest. We handle this at two layers:
1. **Column-level encryption** via application-level AES-256-GCM in `src/encryption/phi.ts` (Phase 6)
2. **Prisma schema** defines the structure with `@db.Text` for encrypted fields — the ORM stores encrypted strings, not raw PHI

## Files to Create

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | All models with relations, indexes, and encrypted field markers |
| `prisma/migrations/001_initial_schema.sql` | Initial migration — manually written for full control |

---

## `prisma/schema.prisma` — Implementation

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Enums ────────────────────────────────────────────────────────────────────

enum UserRole {
  PATIENT
  PROVIDER
  ADMIN
  SYSTEM
}

enum AppointmentStatus {
  SCHEDULED
  CONFIRMED
  IN_PROGRESS
  COMPLETED
  CANCELLED
  NO_SHOW
}

enum MessageStatus {
  SENT
  DELIVERED
  READ
}

// ─── User + Auth ───────────────────────────────────────────────────────────────

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  role         UserRole @default(PATIENT)
  mfaEnabled   Boolean  @default(false) @map("mfa_enabled")
  mfaSecret    String?  @map("mfa_secret") // stored encrypted; null if MFA not enrolled
  active       Boolean  @default(true)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  patient      Patient?
  provider     Provider?
  auditLogs    AuditLog[]
  sentMessages Message[] @relation("SentMessages")
  refreshTokens RefreshToken[]

  @@map("users")
}

model RefreshToken {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  jti       String   @unique // JWT ID — used for revocation
  hash      String   // SHA-256 of the actual token
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")
  revoked   Boolean  @default(false)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([jti])
  @@map("refresh_tokens")
}

// ─── Patient ───────────────────────────────────────────────────────────────────

model Patient {
  id                  String  @id @default(uuid())
  userId              String  @unique @map("user_id")
  // PHI fields — stored encrypted by src/encryption/phi.ts before写入
  firstNameEncrypted  String  @map("first_name_encrypted")  @db.Text
  lastNameEncrypted   String  @map("last_name_encrypted")   @db.Text
  dobEncrypted        String  @map("dob_encrypted")          @db.Text
  phoneEncrypted      String  @map("phone_encrypted")        @db.Text
  // athenahealth mapping
  athenaPatientId     String? @map("athena_patient_id")      @unique

  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  appointments Appointment[]
  messages    MessageThread[] @relation("PatientThreads")

  @@map("patients")
}

// ─── Provider ─────────────────────────────────────────────────────────────────

model Provider {
  id            String  @id @default(uuid())
  userId        String  @unique @map("user_id")
  firstNameEncrypted String @map("first_name_encrypted") @db.Text
  lastNameEncrypted  String @map("last_name_encrypted")  @db.Text
  npi           String  @unique // National Provider Identifier
  specialty     String?
  clinicName    String? @map("clinic_name")
  athenaProviderId String? @map("athena_provider_id") @unique

  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  appointments Appointment[]

  @@map("providers")
}

// ─── Appointment ───────────────────────────────────────────────────────────────

model Appointment {
  id                String            @id @default(uuid())
  patientId         String           @map("patient_id")
  providerId        String           @map("provider_id")
  startTime         DateTime         @map("start_time")
  endTime           DateTime         @map("end_time")
  status            AppointmentStatus @default(SCHEDULED)
  type              String?          // e.g. "new patient", "follow-up"
  notes             String?          @db.Text
  athenaAppointmentId String?        @map("athena_appointment_id") @unique
  createdAt         DateTime        @default(now()) @map("created_at")
  updatedAt         DateTime        @updatedAt @map("updated_at")

  patient  Patient  @relation(fields: [patientId], references: [id], onDelete: Cascade)
  provider Provider @relation(fields: [providerId], references: [id], onDelete: Cascade)

  @@index([patientId])
  @@index([providerId])
  @@index([startTime])
  @@map("appointments")
}

// ─── Secure Messaging ─────────────────────────────────────────────────────────

model MessageThread {
  id         String   @id @default(uuid())
  patientId  String   @map("patient_id")
  subject    String
  status     String   @default("OPEN") // OPEN, CLOSED
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  patient Patient   @relation("PatientThreads", fields: [patientId], references: [id], onDelete: Cascade)
  messages Message[]

  @@unique([patientId, subject])
  @@map("message_threads")
}

model Message {
  id           String        @id @default(uuid())
  threadId     String        @map("thread_id")
  senderId     String        @map("sender_id")
  // Content is encrypted with per-user AES-256-GCM key before storage
  contentEncrypted String    @map("content_encrypted") @db.Text
  status       MessageStatus @default(SENT)
  sentAt       DateTime      @default(now()) @map("sent_at")

  thread   MessageThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  sender   User          @relation("SentMessages", fields: [senderId], references: [id])

  @@index([threadId])
  @@map("messages")
}

// ─── Audit Log (HIPAA) ────────────────────────────────────────────────────────

model AuditLog {
  id           String   @id @default(uuid())
  userId       String?  @map("user_id")  // null for anonymous/system events
  action       String   // REGISTER, LOGIN, VIEW_PATIENT, CREATE_APPOINTMENT, etc.
  resourceType String   @map("resource_type") // Patient, Appointment, Message, etc.
  resourceId   String?  @map("resource_id")
  ipAddress    String?  @map("ip_address")
  userAgent    String?  @map("user_agent")
  success      Boolean  @default(true)
  details      String?  @db.Text  // JSON — encrypted if contains PHI
  createdAt    DateTime @default(now()) @map("created_at")

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([resourceType, resourceId])
  @@index([createdAt])
  @@map("audit_logs")
}

// ─── FHIR Resource Mapping ─────────────────────────────────────────────────────

model FHIRMapping {
  id               String   @id @default(uuid())
  internalId       String   @map("internal_id")       // Our UUID
  externalSystem   String   @map("external_system")   // "athenahealth"
  externalResource String   @map("external_resource") // "Patient", "Appointment", etc.
  externalId       String   @map("external_id")       // athenahealth resource ID
  syncedAt         DateTime @default(now()) @map("synced_at")

  @@unique([externalSystem, externalResource, externalId])
  @@index([internalId])
  @@map("fhir_mappings")
}
```

---

## `prisma/migrations/001_initial_schema.sql` — Implementation

Write the raw SQL migration that Prisma would generate, with comments explaining the decisions:

```sql
-- Migration: 001_initial_schema
-- Created: 2026-06-21
-- Purpose: Create all core tables for HIPAA-compliant patient portal

BEGIN;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            VARCHAR(20) NOT NULL DEFAULT 'PATIENT',
  mfa_enabled     BOOLEAN NOT NULL DEFAULT false,
  mfa_secret      VARCHAR(255),
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role  ON users(role);

-- Refresh tokens (for JWT revocation)
CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jti        VARCHAR(255) UNIQUE NOT NULL,
  hash       VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked    BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_jti     ON refresh_tokens(jti);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- Patients table
CREATE TABLE patients (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name_encrypted  TEXT NOT NULL, -- AES-256-GCM encrypted
  last_name_encrypted   TEXT NOT NULL, -- AES-256-GCM encrypted
  dob_encrypted         TEXT NOT NULL, -- AES-256-GCM encrypted
  phone_encrypted       TEXT NOT NULL, -- AES-256-GCM encrypted
  athena_patient_id     VARCHAR(100) UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_patients_user_id          ON patients(user_id);
CREATE INDEX idx_patients_athena_patient_id ON patients(athena_patient_id);

-- Providers table
CREATE TABLE providers (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name_encrypted  TEXT NOT NULL,
  last_name_encrypted   TEXT NOT NULL,
  npi                   VARCHAR(20) UNIQUE NOT NULL,
  specialty             VARCHAR(255),
  clinic_name           VARCHAR(255),
  athena_provider_id    VARCHAR(100) UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_providers_user_id          ON providers(user_id);
CREATE INDEX idx_providers_npi              ON providers(npi);
CREATE INDEX idx_providers_athena_provider_id ON providers(athena_provider_id);

-- Appointments table
CREATE TABLE appointments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id            UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id           UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  start_time            TIMESTAMPTZ NOT NULL,
  end_time              TIMESTAMPTZ NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
  type                  VARCHAR(100),
  notes                 TEXT,
  athena_appointment_id VARCHAR(100) UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_patient_id    ON appointments(patient_id);
CREATE INDEX idx_appointments_provider_id  ON appointments(provider_id);
CREATE INDEX idx_appointments_start_time   ON appointments(start_time);
CREATE INDEX idx_appointments_status       ON appointments(status);

-- Message threads
CREATE TABLE message_threads (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  subject    VARCHAR(500) NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(patient_id, subject)
);

CREATE INDEX idx_message_threads_patient_id ON message_threads(patient_id);

-- Messages (encrypted content)
CREATE TABLE messages (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id           UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id           UUID NOT NULL REFERENCES users(id),
  content_encrypted   TEXT NOT NULL, -- AES-256-GCM encrypted
  status              VARCHAR(20) NOT NULL DEFAULT 'SENT',
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_thread_id ON messages(thread_id);
CREATE INDEX idx_messages_sent_at  ON messages(sent_at);

-- HIPAA Audit log
CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action          VARCHAR(100) NOT NULL,
  resource_type   VARCHAR(100) NOT NULL,
  resource_id     VARCHAR(255),
  ip_address      VARCHAR(45),
  user_agent      VARCHAR(500),
  success         BOOLEAN NOT NULL DEFAULT true,
  details         TEXT, -- encrypted JSON if contains PHI
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_user_id       ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource     ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at   ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action       ON audit_logs(action);

-- FHIR resource mapping (athenahealth → internal UUID)
CREATE TABLE fhir_mappings (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  internal_id         UUID NOT NULL,
  external_system     VARCHAR(50) NOT NULL,
  external_resource   VARCHAR(100) NOT NULL,
  external_id         VARCHAR(255) NOT NULL,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(external_system, external_resource, external_id)
);

CREATE INDEX idx_fhir_mappings_internal_id ON fhir_mappings(internal_id);

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update_updated_at to all tables with updated_at
CREATE TRIGGER tr_users_updated_at          BEFORE UPDATE ON users          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_patients_updated_at        BEFORE UPDATE ON patients        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_providers_updated_at       BEFORE UPDATE ON providers       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_appointments_updated_at    BEFORE UPDATE ON appointments    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_message_threads_updated_at BEFORE UPDATE ON message_threads FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- pgaudit: enable auditing on all PHI tables
-- This requires: ALTER SYSTEM SET pgaudit.config = 'LOG';
-- And then: CREATE EXTENSION pgaudit;

COMMIT;
```

---

## Implementation Notes

1. **Encrypted fields (`*_encrypted`)** — stored as base64-encoded AES-256-GCM ciphertext. The encryption/decryption happens in `src/encryption/phi.ts` (Phase 6), not in Prisma middleware. The schema just declares `@db.Text` so Prisma can store long strings.

2. **UUID primary keys** — all use `uuid_generate_v4()`. No sequential integers (prevents enumeration attacks).

3. **Indexes** — added on all foreign keys and commonly filtered fields.

4. **No ON DELETE CASCADE on users** — when a user is deleted, patients/providers are cascade-deleted (they're owned by the user), but audit logs use SET NULL to preserve audit trail.

5. **pgaudit extension** — the SQL comment flags it; actual enablement is in `terraform/main.tf` (Phase 6).

---

## Verification Criteria

- [ ] `prisma generate` runs without errors
- [ ] `npx prisma migrate dev --name 001_initial_schema` creates all tables
- [ ] `npx prisma validate` passes
- [ ] All `@map()` column names match the SQL migration column names
- [ ] UUID generation works on insert (no manual ID assignment)
