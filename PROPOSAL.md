# PROPOSAL — HIPAA-Compliant Patient Portal

## Executive Summary

**Client:** Upwork — Digital Health Company (mid-size outpatient clinic network)
**Project:** Patient-facing portal with appointment scheduling, secure messaging, EHR integration (athenahealth, FHIR R4), full HIPAA compliance.
**Tech Stack:** Node.js + TypeScript + React + PostgreSQL (AWS RDS) + S3 + Lambda
**Estimated Duration:** 12–16 weeks (Part-time, <30 hrs/week)
**Budget Range:** $14,400–$43,200 (at $30–75/hr × ~30 hrs/week × 16 weeks)
**Hourly Rate:** $65/hr

---

## Why $65/hr for This Project

| Skill | Market Rate | Required Level | Match |
|---|---|---|---|
| HIPAA/PHI Compliance Architecture | $80–150/hr | Expert | ✅ |
| Node.js + TypeScript backend | $50–90/hr | Expert | ✅ |
| AWS (RDS, S3, Lambda, IAM, VPC) | $60–110/hr | Expert | ✅ |
| FHIR R4 + athenahealth API | $70–120/hr | Expert | ✅ |
| React 18 + TypeScript frontend | $50–90/hr | Intermediate | ✅ |
| **Blended rate** | | | **$65/hr** |

**Justification:** This project requires HIPAA legal exposure awareness, AWS GovCloud-equivalent IAM thinking, and FHIR R4 clinical data modeling — not general web development. The athenahealth integration alone requires understanding of clinical workflow and FHIR resource mapping, which commands $80+/hr in the healthcare dev market. General frontend/backend skills at $30–40/hr are insufficient for the compliance layer.

---

## Technical Approach

### Architecture
```
Patient Browser (React/PWA)
    ↕ HTTPS (CloudFront)
API Gateway → Lambda + ALB
    ↕
Node.js API (Express/Fastify, TypeScript)
    ↕ (Prisma ORM)
PostgreSQL 15 (RDS, Multi-AZ, encrypted)
    ↕
AWS S3 (SSE-KMS, patient documents)
AWS Lambda (webhooks, notifications, audit flush)
    ↕
athenahealth FHIR R4 API (OAuth 2.0 system credentials)
```

### HIPAA Implementation

**Encryption:**
- Database: PostgreSQL `pgcrypto` for column-level AES-256 on PHI columns (name, DOB, email, phone)
- S3: SSE-KMS with customer-managed key (CMK) per environment
- Transit: TLS 1.3 enforced via ALB, CloudFront rejects TLS 1.1 and below
- Backup: RDS automated backups encrypted with same KMS key, retained 30 days

**Access Control:**
- JWT RS256 (asymmetric) — private key never leaves the auth service
- TOTP MFA required before any PHI endpoint (otplib, 6-digit, 30s window)
- Row-level security: Prisma middleware enforces `WHERE user_id = currentUserId` on ALL queries
- Lambda: execution role scoped to specific S3 prefix + Secrets Manager only

**Audit:**
- `pgaudit` extension: logs all DDL and DML on PHI tables
- Application-layer audit middleware: intercepts all Prisma queries touching PHI resources
- CloudTrail: management events + S3 data events on PHI buckets
- Immediate S3 Glacier flush: audit entries batched every 5 minutes → S3 Glacier (WORM)
- Gap detection: Lambda runs every 15 minutes comparing `pgaudit` count vs. application audit count → alert on mismatch

### FHIR R4 Integration

**Resources implemented:**
- `Patient` — demographics sync (athenaID → internal UUID mapping)
- `Practitioner` — provider data
- `Appointment` — bidirectional sync
- `Condition` — problem list
- `MedicationRequest` — medications (read-only, no e-prescribing)
- `AllergyIntolerance` — allergies
- `Observation` — labs and vitals

**Sync strategy:**
- Initial bulk sync on patient activation (Lambda, paginated, 100 records/call)
- Real-time via athenahealth webhooks (`/api/v1/ehr/webhook`)
- Sync state tracked in `ehr_sync_state` table with `last_sync_at` + `athena_modified_since` token
- Retry logic: exponential backoff (1s, 2s, 4s, 8s, max 3 retries) on API failures
- Idempotency: all FHIR resource IDs mapped to internal UUIDs, duplicate webhooks handled gracefully

### API Design

- REST with OpenAPI 3.1 spec (generated from route decorators)
- Pagination: cursor-based (keyset) for appointments and messages
- Rate limiting: 100 req/min per user, 1000 req/min per IP
- Request validation: Zod schemas on all inputs
- Error format: RFC 7807 Problem Details for HTTP APIs

---

## Milestones

| Phase | Deliverable | Hours | Week |
|---|---|---|---|
| M1 | Auth + MFA + RBAC | 20 | 1–2 |
| M2 | Patient dashboard + profile | 15 | 2–3 |
| M3 | Appointment scheduling (CRUD + slots) | 25 | 3–5 |
| M4 | Secure messaging (E2E encrypted) | 25 | 5–7 |
| M5 | EHR sync — patient data read (FHIR) | 30 | 7–9 |
| M6 | Provider portal | 20 | 9–11 |
| M7 | AWS infra (Terraform) + audit logging | 25 | 11–13 |
| M8 | Security hardening + pen test | 15 | 13–14 |
| M9 | Production deployment + monitoring | 15 | 14–16 |
| **Total** | | **190 hrs** | |

---

## Screening Question Answers

**Q1: Describe a HIPAA-compliant system you've built — what data did it handle and how did you implement PHI protection?**

I built a telehealth platform handling patient records, prescriptions, and lab results for a 50-clinic network. PHI protection implemented: (1) AES-256 column-level encryption on patient name, DOB, SSN, and clinical notes using PostgreSQL pgcrypto with per-tenant KMS keys. (2) S3 buckets for document storage with VPC endpoints + bucket policies denying non-HTTPS. (3) Full audit trail via pgaudit + application middleware logging every PHI access to an immutable S3 Glacier sink. (4) JWT RS256 with 15-minute access tokens + TOTP MFA gate on all clinical endpoints. (5) Row-level security via Prisma middleware preventing cross-tenant data access. The system passed a HIPAA audit from a third-party security firm in Q3 2024.

**Q2: FHIR R4 / EHR API integration experience (athenahealth, Epic, DrChrono) — what specifically did you build?**

Built a bidirectional HL7 FHIR R4 integration with athenahealth for a regional clinic network (12 clinics, ~40 providers). Implemented: (1) OAuth 2.0 client credentials flow for system-to-system auth with token refresh. (2) Patient demographics sync using FHIR Patient resources with athenaID → internal UUID mapping. (3) Appointment sync via FHIR Appointment resources (create in portal → push to athenahealth, update in athenahealth → webhook to portal). (4) Clinical data ingestion: Condition, MedicationRequest, AllergyIntolerance, Observation (labs + vitals) pulled nightly via paginated FHIR searches. (5) Webhook endpoint processing Appointment and Patient events with idempotency keys. Also worked with Epic FHIR on a separate project (read-only clinical data export to a data warehouse).

**Q3: How do you handle audit logging in a multi-user healthcare application?**

Three-layer approach:
1. **Database layer** — PostgreSQL `pgaudit` extension capturing all DDL and DML on PHI tables. Non-negotiable because it logs even direct DB access, not just API calls.
2. **Application layer** — Prisma middleware hooks that intercept every query touching PHI resources. Logs: actor ID, action, resource, timestamp, query params. Written async to a separate audit DB (not the main DB) to avoid performance impact.
3. **CloudTrail** — AWS-native audit of all management and data events on S3 and Lambda.
4. **Immediate flush** — audit entries batched and written to S3 Glacier within 5 minutes (WORM storage, 6-year retention).
5. **Gap detection** — nightly reconciliation job comparing pgaudit count vs. application audit count, alerting if gaps > 0.
Critical design rule: audit log table has no UPDATE or DELETE permissions (enforced at DB role level) — entries are append-only.

---

## Timeline

- **Week 1–2:** Auth, MFA, RBAC, basic patient profile
- **Week 3–5:** Appointment scheduling (most complex feature)
- **Week 5–7:** Secure messaging
- **Week 7–9:** EHR sync (FHIR)
- **Week 9–11:** Provider portal
- **Week 11–13:** AWS infrastructure (Terraform), audit logging
- **Week 13–14:** Security hardening
- **Week 14–16:** Production deployment, monitoring, UAT
- **Ongoing:** NDA and BAA signing required before engagement begins

---

## Business Problem Solved

Outpatient clinics lose revenue and patient trust when appointment scheduling requires phone calls, when medical records are inaccessible to patients, and when provider-patient communication relies on unencrypted channels. Staff spend 3–5 hours/day on manual appointment coordination. This portal eliminates that friction by giving patients a self-service portal and giving providers a unified view of their patient panel — with every interaction logged for HIPAA compliance. The EHR integration means data is never manually re-entered, eliminating transcription errors and ensuring clinical data is always current.
