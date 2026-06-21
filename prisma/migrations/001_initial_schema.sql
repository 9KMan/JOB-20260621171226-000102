-- Migration: 001_initial_schema
-- Purpose: Create all core tables for HIPAA-compliant patient portal
BEGIN;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ──────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            VARCHAR(20) NOT NULL DEFAULT 'PATIENT',
  mfa_enabled    BOOLEAN NOT NULL DEFAULT false,
  mfa_secret     VARCHAR(255),
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role  ON users(role);

-- ── Refresh Tokens ─────────────────────────────────────────────────────────────
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

-- ── Patients ──────────────────────────────────────────────────────────────────
CREATE TABLE patients (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name_encrypted  TEXT NOT NULL,
  last_name_encrypted   TEXT NOT NULL,
  dob_encrypted         TEXT NOT NULL,
  phone_encrypted       TEXT NOT NULL,
  athena_patient_id     VARCHAR(100) UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_patients_user_id           ON patients(user_id);
CREATE INDEX idx_patients_athena_patient_id ON patients(athena_patient_id);

-- ── Providers ──────────────────────────────────────────────────────────────────
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

CREATE INDEX idx_providers_user_id            ON providers(user_id);
CREATE INDEX idx_providers_npi              ON providers(npi);
CREATE INDEX idx_providers_athena_provider_id ON providers(athena_provider_id);

-- ── Appointments ───────────────────────────────────────────────────────────────
CREATE TABLE appointments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id            UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id           UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  start_time           TIMESTAMPTZ NOT NULL,
  end_time             TIMESTAMPTZ NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
  type                 VARCHAR(100),
  notes                TEXT,
  athena_appointment_id VARCHAR(100) UNIQUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_patient_id   ON appointments(patient_id);
CREATE INDEX idx_appointments_provider_id  ON appointments(provider_id);
CREATE INDEX idx_appointments_start_time  ON appointments(start_time);
CREATE INDEX idx_appointments_status      ON appointments(status);

-- ── Message Threads ─────────────────────────────────────────────────────────────
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

-- ── Messages ───────────────────────────────────────────────────────────────────
CREATE TABLE messages (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id          UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id          UUID NOT NULL REFERENCES users(id),
  content_encrypted  TEXT NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'SENT',
  sent_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_thread_id ON messages(thread_id);
CREATE INDEX idx_messages_sent_at  ON messages(sent_at);

-- ── HIPAA Audit Log ────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action          VARCHAR(100) NOT NULL,
  resource_type   VARCHAR(100) NOT NULL,
  resource_id     VARCHAR(255),
  ip_address      VARCHAR(45),
  user_agent      VARCHAR(500),
  success         BOOLEAN NOT NULL DEFAULT true,
  details         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_user_id    ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource  ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action    ON audit_logs(action);

-- ── FHIR Resource Mapping ──────────────────────────────────────────────────────
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

-- ── Update Timestamp Triggers ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_users_updated_at          BEFORE UPDATE ON users          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_patients_updated_at        BEFORE UPDATE ON patients        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_providers_updated_at       BEFORE UPDATE ON providers       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_appointments_updated_at    BEFORE UPDATE ON appointments    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_message_threads_updated_at BEFORE UPDATE ON message_threads FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── pgaudit (HIPAA) ────────────────────────────────────────────────────────────
-- Enable per-session logging on all PHI tables:
-- Run after DB setup: ALTER DATABASE medportal SET pgaudit.config = 'READ, WRITE';
-- Or per-table: ALTER TABLE patients SET (pgaudit.log = 'READ, WRITE');

COMMIT;
