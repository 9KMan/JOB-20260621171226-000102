-- Migration: 001_initial_schema
-- Created: 2026-06-21
-- Description: Initial schema for HIPAA-compliant patient portal
-- Models: User, Patient, Provider, Appointment, Message, AuditLog

-- Enable UUID extension for primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Users table — authentication & authorization
-- =====================================================
CREATE TABLE "users" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "email" VARCHAR(255) NOT NULL UNIQUE,
  "password_hash" VARCHAR(255) NOT NULL,
  "role" VARCHAR(50) NOT NULL,                          -- PATIENT | PROVIDER | ADMIN
  "mfa_secret" TEXT,                                    -- encrypted TOTP secret (nullable for non-MFA users)
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for user lookups
CREATE INDEX "idx_users_email" ON "users"("email");
CREATE INDEX "idx_users_role" ON "users"("role");

-- =====================================================
-- Patients table — PHI fields encrypted at rest
-- =====================================================
CREATE TABLE "patients" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "user_id" UUID NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "first_name" VARCHAR(255) NOT NULL,
  "last_name" TEXT NOT NULL,                            -- encrypted
  "dob" TEXT NOT NULL,                                  -- encrypted — Date of Birth
  "phone" TEXT NOT NULL,                                -- encrypted
  "athenahealth_id" VARCHAR(255)                        -- EHR reference ID
);

-- Indexes for patient lookups
CREATE INDEX "idx_patients_user_id" ON "patients"("user_id");
CREATE INDEX "idx_patients_athenahealth_id" ON "patients"("athenahealth_id");

-- =====================================================
-- Providers table — healthcare provider profile
-- =====================================================
CREATE TABLE "providers" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "user_id" UUID NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "npi" VARCHAR(20) NOT NULL UNIQUE,                    -- 10-digit National Provider Identifier
  "specialty" VARCHAR(100) NOT NULL                     -- e.g., Internal Medicine, Cardiology
);

-- Indexes for provider lookups
CREATE INDEX "idx_providers_user_id" ON "providers"("user_id");
CREATE INDEX "idx_providers_npi" ON "providers"("npi");
CREATE INDEX "idx_providers_specialty" ON "providers"("specialty");

-- =====================================================
-- Appointments table — scheduling with EHR sync
-- =====================================================
CREATE TABLE "appointments" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "patient_id" UUID NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
  "provider_id" UUID NOT NULL REFERENCES "providers"("id") ON DELETE CASCADE,
  "start" TIMESTAMP NOT NULL,                           -- appointment start (UTC)
  "end" TIMESTAMP NOT NULL,                             -- appointment end (UTC)
  "status" VARCHAR(50) NOT NULL DEFAULT 'SCHEDULED',   -- SCHEDULED | CONFIRMED | CANCELLED | COMPLETED
  "athena_appointment_id" VARCHAR(255)                 -- athenahealth sync reference
);

-- Indexes for appointment queries
CREATE INDEX "idx_appointments_patient_id" ON "appointments"("patient_id");
CREATE INDEX "idx_appointments_provider_id" ON "appointments"("provider_id");
CREATE INDEX "idx_appointments_status" ON "appointments"("status");
CREATE INDEX "idx_appointments_start" ON "appointments"("start");
CREATE INDEX "idx_appointments_athena_id" ON "appointments"("athena_appointment_id");

-- =====================================================
-- Messages table — encrypted secure messaging
-- =====================================================
CREATE TABLE "messages" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "thread_id" UUID NOT NULL,                            -- conversation thread identifier
  "sender_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "encrypted_content" TEXT NOT NULL,                    -- AES-256 encrypted message body
  "sent_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for message retrieval
CREATE INDEX "idx_messages_thread_id" ON "messages"("thread_id");
CREATE INDEX "idx_messages_sender_id" ON "messages"("sender_id");
CREATE INDEX "idx_messages_sent_at" ON "messages"("sent_at");

-- =====================================================
-- Audit logs table — HIPAA compliance audit trail
-- =====================================================
CREATE TABLE "audit_logs" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "action" VARCHAR(100) NOT NULL,                      -- VIEW | CREATE | UPDATE | DELETE | LOGIN | LOGOUT
  "resource" VARCHAR(100) NOT NULL,                    -- Patient | Appointment | Message | User | Provider
  "resource_id" UUID,                                  -- UUID of affected resource
  "ip_address" VARCHAR(45),                             -- IPv4 or IPv6 address
  "timestamp" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for audit log queries (compliance reporting)
CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs"("user_id");
CREATE INDEX "idx_audit_logs_resource" ON "audit_logs"("resource");
CREATE INDEX "idx_audit_logs_timestamp" ON "audit_logs"("timestamp");
CREATE INDEX "idx_audit_logs_action" ON "audit_logs"("action");
CREATE INDEX "idx_audit_logs_resource_id" ON "audit_logs"("resource_id");
