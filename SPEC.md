# Specification: Full Stack Developer for HIPAA-Compliant Patient Portal. Patient-facing portal for outpatient clinics: appointment scheduling, secure messaging, EHR integration (athenahealth, FHIR R4). Node.js + PostgreSQL on AWS. NDA + BAA required. Key deliverables: (1) Secure patient portal — login, scheduling, provider messaging. (2) EHR data sync via athenahealth FHIR R4. (3) AWS infrastructure (RDS, Lambda, S3, IAM). (4) Audit trail + access control layer for PHI/HIPAA compliance.

## 1. Project Overview

**Project:** Full Stack Developer for HIPAA-Compliant Patient Portal. Patient-facing portal for outpatient clinics: appointment scheduling, secure messaging, EHR integration (athenahealth, FHIR R4). Node.js + PostgreSQL on AWS. NDA + BAA required. Key deliverables: (1) Secure patient portal — login, scheduling, provider messaging. (2) EHR data sync via athenahealth FHIR R4. (3) AWS infrastructure (RDS, Lambda, S3, IAM). (4) Audit trail + access control layer for PHI/HIPAA compliance.
**GitHub Repo:** https://github.com/9KMan/JOB-20260621171226-000102
**Lead:** https://www.upwork.com/jobs/~022068729599304359969
**Client:** Upwork — HIPAA Patient Portal
**Tier:** expert
**Budget:** $30-75/hr
**Rate:** N/A
**Timeline:** 4-8 weeks

## 2. Technical Stack

Node.js · React · Amazon Web Services · API Integration · PostgreSQL · TypeScript · HIPAA · Healthcare

## 3. Architecture

- Backend: Node.js/TypeScript REST API
- Database: PostgreSQL with proper indexing
- Cloud: AWS (EC2, S3, Lambda, CloudFront)
- Frontend: React.js SPA with component architecture
- Serverless: AWS Lambda / Vercel / Cloudflare Functions

### API Design
- RESTful endpoints with JSON request/response
- Authentication via JWT (HS256) or bcrypt
- Middleware for logging, error handling, CORS
- Versioned routes (/api/v1/...) where applicable

### Data Layer
- PostgreSQL as primary datastore
- Connection pooling via PGBouncer or similar
- Migration management via Alembic or raw SQL
- Indexes on foreign keys and high-cardinality columns

### Frontend (if applicable)
- Single-page application or server-rendered pages
- Responsive UI with modern CSS/JS framework
- State management for complex client-side logic

## 4. Data Model

### Core Entities
- Define entity schema based on job requirements
- Use UUIDs for primary keys (not auto-increment)
- Add created_at / updated_at timestamps to all tables
- Soft-delete pattern where appropriate

### Relationships
- Foreign key constraints with ON DELETE CASCADE
- Many-to-many via junction tables
- Eager loading for nested relationships in API

## 5. Project Structure

```
├── api/                  # FastAPI / Express routes + schemas
├── models/               # DB models / SQLAlchemy / Prisma
├── services/             # Business logic layer
├── workers/              # Background jobs (Celery, BullMQ, etc.)
├── migrations/           # DB migrations (Alembic / Flyway)
├── tests/                # Unit + integration tests
├── Dockerfile            # Production container
├── docker-compose.yml    # Local dev environment
└── README.md             # Setup instructions
```

## 6. Out of Scope

- Mobile apps (web only unless explicitly specified)
- Multi-tenant / white-label customization
- Performance optimization at 1M+ user scale

## 7. Acceptance Criteria

- [ ] REST API with all planned endpoints implemented and returning JSON
- [ ] Database schema created with migrations applied
- [ ] Authentication system (login/logout/JWT or OAuth)
- [ ] Frontend UI implemented, responsive, and functional
- [ ] AI/ML pipeline integrated and functional
- [ ] AWS services configured per architecture

**GitHub Repo:** https://github.com/9KMan/JOB-20260621171226-000102
