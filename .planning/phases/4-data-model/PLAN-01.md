---
GSD: true
phase: 4-data-model
plan: PLAN-01
created: 2026-06-21T17:12:26Z
status: in_progress
owner: squad-agent
---

# Phase 04: Data Model — Implementation Plan

## Phase Goal
Implement the Prisma data model and PostgreSQL schema for the HIPAA-compliant patient portal.

## Files to Create
- `prisma/schema.prisma` — Prisma schema with all models
- `prisma/migrations/001_initial_schema.sql` — Raw SQL migration

## Implementation Steps

### Step 1: Create Prisma Schema (`prisma/schema.prisma`)

Define all models with encrypted fields using `@db.Text` and custom `@map` column names.

**Models implemented:**
- **User** — id, email, passwordHash, role, mfaSecret, createdAt
- **Patient** — id, userId, firstName, lastName (encrypted), dob (encrypted), phone (encrypted), athenahHealthId
- **Provider** — id, userId, npi, specialty
- **Appointment** — id, patientId, providerId, start, end, status, athenaAppointmentId
- **Message** — id, threadId, senderId, encryptedContent, sentAt
- **AuditLog** — id, userId, action, resource, resourceId, ipAddress, timestamp

**Encrypted fields** (`@db.Text` for large ciphertext):
- `Patient.lastName`, `Patient.dob`, `Patient.phone` — PHI encrypted at rest
- `Message.encryptedContent` — AES-256 encrypted message body
- `User.mfaSecret` — TOTP secret stored encrypted

### Step 2: Create SQL Migration (`prisma/migrations/001_initial_schema.sql`)

Raw PostgreSQL DDL covering all 6 tables with:
- UUID primary keys via `uuid-ossp`
- Proper foreign key constraints with `ON DELETE CASCADE`
- Indexes on all foreign keys and queryable fields
- HIPAA-relevant indexes on `audit_logs` for compliance reporting

### Step 3: Validate Schema

Run `npx prisma validate` to confirm schema syntax is correct.

## Done When
- [x] `prisma/schema.prisma` created with all 6 models
- [x] `prisma/migrations/001_initial_schema.sql` created with full DDL
- [ ] Prisma schema passes validation
- [ ] Files committed and pushed to `origin master`
