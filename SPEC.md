# SPEC.md — HIPAA-Compliant Patient Portal

## 1. Project Overview

**Project Name:** MedPortal — HIPAA-Compliant Patient Portal
**Type:** Healthcare SaaS Web Application (B2B2C)
**Core Functionality:** Patient-facing portal for a network of outpatient clinics enabling appointment scheduling, secure provider messaging, and EHR integration with athenahealth via FHIR R4.
**Target Users:** Patients, Healthcare Providers (physicians, nurses, office staff), Clinic Administrators
**HIPAA Classification:** PHI — all data at rest and in transit must be encrypted; full audit logging required.

---

## 2. Technical Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Backend API | Node.js 20 + Express.js (or Fastify) |
| Database | PostgreSQL 15 on AWS RDS (db.t3.medium minimum) |
| ORM | Prisma (TypeScript-first, migrations) |
| Auth | JWT (RS256) + MFA via TOTP (otplib) |
| File Storage | AWS S3 (encrypted buckets, SSE-KMS) |
| Serverless | AWS Lambda (scheduled jobs, notifications) |
| CDN/Proxy | AWS CloudFront + API Gateway |
| Monitoring | AWS CloudWatch + Sentry |
| Infrastructure | Terraform (IaC) |
| EHR Integration | athenahealth FHIR R4 API |
| Audit | Custom audit log table + CloudTrail |

---

## 3. Functionality Specification

### 3.1 Authentication & Access Control

- **Patient registration:** Email + phone verification, identity verification step
- **Provider login:** SSO via clinic identity provider (SAML 2.0 stub)
- **MFA:** TOTP (Google Authenticator / Authy) required for all roles
- **Session management:** JWT access token (15min) + rotating refresh token (7 days)
- **Password policy:** min 12 chars, complexity requirements, breach detection (HaveIBeenPwned API)
- **Role-based access control (RBAC):**
  - `PATIENT` — own records only
  - `PROVIDER` — assigned patient records
  - `ADMIN` — clinic-wide data, user management
  - `SYSTEM` — EHR sync service account

### 3.2 Patient Portal — Core Features

**Dashboard:**
- Upcoming appointments list
- Unread messages badge
- Recent lab results (if available via FHIR)
- Action items (required forms, unsigned documents)

**Appointment Scheduling:**
- View available slots by provider and date range
- Book / reschedule / cancel appointments
- Appointment reminders via email + SMS (AWS SNS)
- Waitlist for fully-booked slots
- Recurring appointment series (weekly, monthly)

**Secure Messaging:**
- Patient ↔ Provider async messaging
- End-to-end encryption at rest (AES-256-GCM)
- PII auto-redaction before storage (regex + named entity detection)
- Attachment support (PDF, images) — virus scanned before storage
- Message read receipts
- Thread-based conversations

**Health Records (Read-only from EHR):**
- Problem list (FHIR Condition)
- Medication list (FHIR MedicationRequest)
- Allergies (FHIR AllergyIntolerance)
- Immunizations (FHIR Immunization)
- Lab results (FHIR Observation)
- Download records as PDF or FHIR bundle

### 3.3 Provider Portal

- Patient list with search and filter
- View patient's full record (FHIR data)
- Send secure messages to patient
- Manage appointment availability slots
- View audit log for their patient panel

### 3.4 EHR Integration — athenahealth FHIR R4

**Scope:**
- Patient demographics sync (FHIR Patient)
- Appointment sync (FHIR Appointment)
- Clinical data: conditions, medications, allergies, observations (FHIR resources)
- Webhook receiver for real-time updates from athenahealth

**FHIR R4 Resources to implement:**
- `Patient` — demographics
- `Practitioner` — provider data
- `Appointment` — scheduling
- `Condition` — problem list
- `MedicationRequest` — prescriptions
- `AllergyIntolerance` — allergies
- `Observation` — lab results, vitals
- `Encounter` — visit history

**Authentication:** OAuth 2.0 with athenahealth's authorization server (client credentials grant for system-to-system sync).

### 3.5 AWS Infrastructure

**RDS PostgreSQL:**
- Multi-AZ deployment (production)
- Automated backups (30-day retention)
- Encryption at rest (AWS KMS)
- `db.t3.medium` dev, `db.r6g.large` production
- Connection pooling: PgBouncer (transaction mode)
- Private subnet only — no public access

**S3:**
- `medportal-documents-<env>` — patient documents, encrypted (SSE-KMS)
- `medportal-audit-logs-<env>` — audit log exports, Glacier storage class
- Bucket policies: deny non-HTTPS, deny unless from specific VPC endpoint
- Versioning enabled, lifecycle policies

**IAM:**
- Least-privilege roles per service
- No long-lived access keys — use IAM roles + web identity federation
- Lambda execution role with scoped permissions

**VPC:**
- 3-tier: public (CloudFront), private (Lambda, ALB), data (RDS, ElastiCache)
- VPC endpoints for S3, Secrets Manager, SNS, SQS
- No direct SSH/RDP to any instance

**Lambda:**
- `process-ehr-webhook` — receives and processes athenahealth events
- `send-notification` — email/SMS dispatch
- `audit-log-flush` — batches audit writes to S3 for long-term retention

### 3.6 Audit Logging & HIPAA Compliance

**Audit Log Table (`audit_log`):**
Every PHI access must log:
- `actor_id` (user ID or SYSTEM)
- `actor_role`
- `action` (CREATE, READ, UPDATE, DELETE, EXPORT, LOGIN, LOGOUT)
- `resource_type` (Patient, Appointment, Message, etc.)
- `resource_id`
- `ip_address`
- `user_agent`
- `timestamp` (UTC)
- `success` (boolean)
- `details` (JSON — query params, changed fields, etc.)

**Additional requirements:**
- CloudTrail enabled on all AWS accounts (management + data events)
- Database audit: PostgreSQL `pgaudit` extension logging all DDL and DML
- Immutable audit log: audit entries written to S3 Glacier immediately after (WORM storage)
- Log retention: 6 years minimum (HIPAA requirement)
- Breach notification: automated alerting if audit log gaps detected

---

## 4. API Endpoints

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Patient self-registration |
| POST | `/api/v1/auth/login` | Login (returns JWT) |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/mfa/setup` | Generate TOTP secret |
| POST | `/api/v1/auth/mfa/verify` | Verify TOTP code |
| POST | `/api/v1/auth/logout` | Invalidate refresh token |

### Patients
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/patients/me` | Current patient profile |
| PUT | `/api/v1/patients/me` | Update profile |
| GET | `/api/v1/patients/me/conditions` | FHIR Condition list |
| GET | `/api/v1/patients/me/medications` | FHIR MedicationRequest list |
| GET | `/api/v1/patients/me/allergies` | FHIR AllergyIntolerance list |
| GET | `/api/v1/patients/me/observations` | FHIR Observation (labs/vitals) |

### Appointments
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/appointments/slots` | Available slots (query: provider_id, date_range) |
| POST | `/api/v1/appointments` | Book appointment |
| GET | `/api/v1/appointments` | List patient's appointments |
| PUT | `/api/v1/appointments/:id` | Reschedule |
| DELETE | `/api/v1/appointments/:id` | Cancel |

### Messaging
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/messages/threads` | List message threads |
| POST | `/api/v1/messages/threads` | Start new thread |
| GET | `/api/v1/messages/threads/:id` | Get thread messages |
| POST | `/api/v1/messages/threads/:id/messages` | Send message |

### EHR Sync (System)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/ehr/webhook` | athenahealth webhook receiver |
| POST | `/api/v1/ehr/sync/patients` | Manual patient sync trigger |
| POST | `/api/v1/ehr/sync/appointments` | Manual appointment sync |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/admin/users` | List users |
| POST | `/api/v1/admin/users` | Create user |
| GET | `/api/v1/admin/audit-log` | Query audit log (admin only) |
| GET | `/api/v1/admin/audit-log/export` | Export audit log to S3 |

---

## 5. Database Schema (Core Tables)

```
users               — id, email, password_hash, role, mfa_secret, created_at
patients            — id, user_id (FK), first_name, last_name, dob, phone, athena_id
providers           — id, user_id (FK), first_name, last_name, specialty, athena_id
appointments        — id, patient_id (FK), provider_id (FK), start_at, end_at, status, athena_id
appointment_slots    — id, provider_id (FK), start_at, end_at, is_available
message_threads      — id, patient_id (FK), provider_id (FK), subject, created_at
messages            — id, thread_id (FK), sender_id (FK), encrypted_content, attachment_keys, sent_at
audit_log           — id, actor_id, actor_role, action, resource_type, resource_id, ip_address, user_agent, timestamp, success, details (JSONB)
ehr_sync_state      — id, resource_type, last_sync_at, athena_modified_since
```

---

## 6. Out of Scope

- Insurance eligibility verification
- Billing / claims processing
- Telehealth video visits
- Prescription refills (read-only medication list, no e-prescribing)
- Mobile apps (web only)
- Third-party SSO (beyond SAML stub)

---

## 7. Acceptance Criteria

1. All API endpoints require valid JWT; expired tokens return 401
2. MFA enforced before any PHI access
3. Every API call that reads/writes PHI creates an audit_log entry
4. Database credentials stored in AWS Secrets Manager, never in code or env files
5. S3 buckets deny non-HTTPS requests
6. athenahealth webhook correctly processes `Appointment` and `Patient` events
7. Patient cannot see another patient's data (enforced at ORM query level)
8. Audit log is append-only; no UPDATE or DELETE operations permitted on audit_log table
9. All PHI encrypted at rest (database level for columns, S3 SSE-KMS for files)
10. Infrastructure reproducible from Terraform (no manual AWS console changes)
