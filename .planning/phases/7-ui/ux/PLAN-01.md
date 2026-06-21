---
GSD: true
phase: 07-ehr-integration
version: 1.0.0
created: 2026-06-21
owner: backend-team
status: in-progress
---

# Phase 07: EHR Integration + Deployment

## Phase Goal
Implement EHR integration via athenahealth FHIR R4 API, S3 document management with virus scanning, AWS notification delivery (SES/SNS), and Terraform deployment infrastructure.

## Verification Checklist
Based on SPEC.md acceptance criteria:
1. FHIR R4 client authenticates via OAuth2 client credentials flow
2. Patient, Appointment, Condition, MedicationRequest, and Observation resources sync to internal UUIDs
3. Webhook endpoint verifies HMAC-SHA256 signatures and enforces idempotency
4. S3 presigned URLs expire within 15 minutes; virus scan triggered on upload
5. Notification worker sends email via SES and SMS via SNS for appointment reminders
6. Terraform produces applied infrastructure; .env.terraform.example documents all secrets
7. All integrations have unit test coverage

## Done When
- All acceptance criteria are verifiable via integration tests
- Terraform plan/apply completes without error
- Verification commands documented

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/integration/athenahealth/fhir.ts` | FHIR R4 client: OAuth2 client credentials, GET /Patient, GET /Appointment, GET /Condition, GET /MedicationRequest, GET /Observation — map to internal UUIDs |
| `src/integration/athenahealth/webhook.ts` | POST /webhooks/athena — verify HMAC-SHA256 signature, idempotency check via `X-Athena-Event-Id` header, process Appointment/Patient events |
| `src/integration/s3.ts` | Presigned URL generation for document upload/download (15-min expiry), trigger AWS Lambda virus scan on put events |
| `src/workers/notification.ts` | AWS SES for email and SNS for SMS appointment reminders; handles retry with exponential backoff |
| `.env.terraform.example` | AWS access key / secret, athenahealth client ID / secret, webhook signing secret, S3 bucket names, SNS topic ARNs |
| `terraform/terraform.tfvars.example` | Terraform variable definitions for region, environment, instance types, CIDR blocks, and secret refs |

---

## Integration Architecture

### 1. athenahealth FHIR R4 Client (`src/integration/athenahealth/fhir.ts`)

**Authentication — OAuth2 Client Credentials Flow**

```
Client → POST https://api.athenahealth.com/oauth2/token
  Body: grant_type=client_credentials
        client_id=<ATHENA_CLIENT_ID>
        client_secret=<ATHENA_CLIENT_SECRET>
        scope=FHIR
Response: { access_token, expires_in, token_type }
```

- Token cached in memory with `expires_in - 60` second refresh buffer
- All subsequent FHIR calls include `Authorization: Bearer <access_token>`

**FHIR Resource Fetching**

| Method | Endpoint | Internal Mapping |
|--------|----------|-----------------|
| `GET /Patient/{id}` | Fetch patient demographics | `athena_patient_id` → internal `UUID` via `patient_mapping` table |
| `GET /Appointment?patient={ref}` | Fetch appointments for patient | `athena_appointment_id` → internal `UUID` via `appointment_mapping` |
| `GET /Condition?patient={ref}` | Fetch active problem list | Stored as `Condition` entity with external_id |
| `GET /MedicationRequest?patient={ref}` | Fetch prescriptions | Stored as `MedicationRequest` entity |
| `GET /Observation?patient={ref}` | Fetch vitals / lab results | Stored as `Observation` entity with `effectiveDateTime` |

**UUID Mapping Strategy**

Each sync job writes a `external_system → external_id → internal_uuid` row in a `resource_mapping` table. When athenahealth sends an ID, we look up the internal UUID; if not found, create a new entity and persist the mapping.

---

### 2. athenahealth Webhook Handler (`src/integration/athenahealth/webhook.ts`)

**Endpoint: `POST /webhooks/athena`**

**Signature Verification**

```
X-Athena-Signature header contains HMAC-SHA256(body, WEBHOOK_SECRET)
Compute: hmac_sha256(raw_body, process.env.ATHENA_WEBHOOK_SECRET)
Compare: timingSafeEqual(computed, received)
Reject if mismatch → 401
```

**Idempotency**

```
X-Athena-Event-Id header value stored in Redis with TTL of 24h
If key exists → return 200 (already processed)
Else → process event, SET key with EX 86400
```

**Event Processing**

| Event Type | Action |
|------------|--------|
| `appointment.created` | Upsert `Appointment` via FHIR fetch, notify patient |
| `appointment.updated` | Patch `Appointment`, cancel/reschedule notification |
| `patient.created` | Upsert `Patient`, trigger initial sync job |
| `patient.updated` | Patch `Patient` demographics |

---

### 3. S3 Document Integration (`src/integration/s3.ts`)

**Presigned URL Generation**

```typescript
// Upload presigned URL (client → S3 directly)
getUploadUrl(documentId: string, contentType: string): string
  → s3.getSignedUrl('putObject', {
      Bucket: DOCUMENTS_BUCKET,
      Key: `documents/${documentId}`,
      ContentType: contentType,
      Expires: 900  // 15 minutes
    })

// Download presigned URL
getDownloadUrl(documentId: string): string
  → s3.getSignedUrl('getObject', {
      Bucket: DOCUMENTS_BUCKET,
      Key: `documents/${documentId}`,
      Expires: 900
    })
```

**Virus Scan Trigger**

On `s3:ObjectCreated:PutObject` event for `documents/*` key:
1. Lambda triggered via S3 event notification
2. Lambda invokes ClamAV via SSM command or invokes `aws-lambda-runtime扫描` layer
3. Scan result written to DynamoDB `document_scans` table: `{ documentId, status: CLEAN|INFECTED|ERROR, scannedAt }`
4. If `INFECTED`, delete object and emit `document.quarantined` event to EventBridge

---

### 4. Notification Worker (`src/workers/notification.ts`)

**AWS SES — Email Reminders**

```typescript
// Triggered by EventBridge rule: appointment.reminder
ses.sendEmail({
  Source: NOTIFICATION_SENDER,
  Destination: { ToAddresses: [patient.email] },
  Message: {
    Subject: { Data: 'Appointment Reminder' },
    Body: { Html: { Data: renderTemplate('reminder-email', { appointment }) } }
  }
})
```

**AWS SNS — SMS Reminders**

```typescript
// For patients with phone but no email
sns.publish({
  PhoneNumber: patient.phone,
  Message: `Reminder: Appointment on ${appointment.dateTime} with ${provider.name}. Reply CONFIRM to confirm.`
})
```

**Retry Logic**

- SES/SNS failures queued to SQS dead-letter queue
- Lambda retry with exponential backoff: 1s, 2s, 4s, 8s, max 3 attempts
- After 3 failures → mark `notification_status = FAILED` in DB, alert via CloudWatch

---

## Terraform Infrastructure (`terraform/`)

### Resources to Provision

| Resource | Purpose |
|----------|---------|
| `aws_lambda_function` | Notification worker, virus scan scanner |
| `aws_s3_bucket` | Documents bucket with versioning + lifecycle |
| `aws_s3_bucket_notification` | Trigger virus scan Lambda on upload |
| `aws_ses_email_identity` | Sending domain verification |
| `aws_sns_topic` | Appointment reminder SMS topic |
| `aws_sqs_queue` | Dead-letter queue for failed notifications |
| `aws_eventbridge_rule` | Schedule: appointment reminder 24h before |
| `aws_dynamodb_table` | `resource_mapping`, `document_scans` |
| `aws_secretsmanager_secret` | athenahealth credentials, webhook secret |

### `terraform/terraform.tfvars.example`

```hcl
environment          = "production"
aws_region           = "us-east-1"
athena_environment   = "prod"
notification_sender  = "no-reply@example.com"
documents_bucket_name = "app-documents-prod"
```

---

## Implementation Order

1. **FHIR client** — implement OAuth2 token fetch + patient/appointment sync
2. **Webhook handler** — signature verification + idempotency + event routing
3. **S3 integration** — presigned URLs + Lambda virus scan scaffold
4. **Notification worker** — SES email + SNS SMS with retry
5. **Terraform** — all AWS resources as code
6. **Integration tests** — mock athenahealth + AWS services
7. **Deploy** — `terraform apply` + ECS/EKS service update

---

## Verification Commands

```bash
# FHIR client unit tests
npx jest src/integration/athenahealth/fhir.test.ts

# Webhook handler tests
npx jest src/integration/athenahealth/webhook.test.ts

# S3 integration tests
npx jest src/integration/s3.test.ts

# Notification worker tests
npx jest src/workers/notification.test.ts

# Terraform plan
cd terraform && terraform plan -var-file terraform.tfvars.example

# Terraform apply (CI/CD only)
cd terraform && terraform apply -var-file terraform.tfvars.example -auto-approve
```
