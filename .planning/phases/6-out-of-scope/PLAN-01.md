# Phase 06: Out-of-Scope → IMPLEMENTATION: Terraform + Audit Infrastructure

## Phase Goal
Implement infrastructure-as-code for AWS backend using Terraform and build audit/PHI encryption modules.

## GSD (Good Software Delivery) Frontmatter
- **Package:** terraform-aws-infrastructure
- **Version:** 1.0.0
- **Priority:** P1 (critical path)
- **Complexity:** Medium
- **Definition of Done:** All files created, Terraform validates, audit logger compiles, encryption helpers typed

## Context
AWS backend infrastructure must be provisioned as code for reproducibility and auditability. HIPAA compliance requires:
1. Encrypted PHI data at rest (column-level AES-256-GCM)
2. Structured audit logging of all data access
3. VPC-isolated RDS PostgreSQL with encrypted storage
4. S3 buckets with SSE-KMS encryption
5. Lambda functions with minimal IAM privileges

## Terraform HCL Patterns

### Provider & Remote State
```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket = "your-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "us-east-1"
  }
}
```

### VPC Module Pattern
```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
  name    = var.project_name
  cidr    = var.vpc_cidr
  azs     = data.aws_availability_zones.available.names
  private_subnets = var.private_subnets
  public_subnets  = var.public_subnets
  enable_nat_gateway = true
  tags = { Environment = var.environment, ManagedBy = "terraform" }
}
```

### RDS PostgreSQL Pattern (encrypted storage, multi-AZ)
```hcl
resource "aws_db_instance" "postgres" {
  identifier           = "${var.project_name}-rds"
  engine               = "postgres"
  engine_version       = var.db_engine_version
  instance_class       = var.db_instance_class
  allocated_storage    = var.db_allocated_storage
  storage_encrypted    = true
  storage_type         = "gp3"
  multi_az             = var.environment == "prod" ? true : false
  db_name              = var.db_name
  username             = var.db_username
  password             = var.db_password
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name
  backup_retention_period = var.db_backup_retention
  enabled_cloudwatch_logs_exports = ["postgresql"]
  final_snapshot_identifier = "${var.project_name}-final-snapshot"
  skip_final_snapshot       = var.environment != "prod"
  tags = { Environment = var.environment }
}
```

### S3 Buckets with SSE-KMS Pattern
```hcl
resource "aws_s3_bucket" "data_store" {
  bucket = "${var.project_name}-data-${var.environment}"
  tags   = { Environment = var.environment, Classification = "phi" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data_store" {
  bucket = aws_s3_bucket.data_store.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.s3.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_kms_key" "s3" {
  description             = "KMS key for S3 bucket encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags = { Environment = var.environment }
}
```

### Lambda Function Pattern (with VPC config for RDS access)
```hcl
resource "aws_lambda_function" "api_handler" {
  function_name    = "${var.project_name}-api-${var.environment}"
  filename         = data.archive_file.lambda.output_path
  handler          = "dist/handler.handler"
  runtime          = "nodejs20.x"
  role             = aws_iam_role.lambda_exec.arn
  source_code_hash  = data.archive_file.lambda.output_base64sha256
  vpc_config {
    subnet_ids         = module.vpc.private_subnets
    security_group_ids = [aws_security_group.lambda.id]
  }
  environment {
    variables = {
      NODE_ENV      = var.environment
      RDS_ENDPOINT  = aws_db_instance.postgres.address
      S3_BUCKET     = aws_s3_bucket.data_store.id
    }
  }
  timeout     = 30
  memory_size = 256
  tags = { Environment = var.environment }
}
```

### IAM Role Pattern (least privilege)
```hcl
data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect = "Allow"
    principals { type = "Service", identifiers = ["lambda.amazonaws.com"] }
    actions   = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "lambda_exec" {
  name               = "${var.project_name}-lambda-role-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.project_name}-lambda-policy-${var.environment}"
  role = aws_iam_role.lambda_exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "rds:Describe*",
          "rds:Connect",
          "secretsmanager:GetSecretValue",
          "s3:GetObject",
          "s3:PutObject",
          "kms:Decrypt",
          "kms:Encrypt"
        ]
        Resource = "*"
      }
    ]
  })
}
```

## Files to Create

### src/audit/logger.ts
Structured audit log module with fields:
- `userId`: string — authenticated user identifier
- `action`: string — CRUD operation performed
- `resource`: string — entity type (Patient, Record, etc.)
- `resourceId`: string — specific resource identifier
- `ipAddress`: string — client IP from request
- `userAgent`: string — browser/client user agent
- `timestamp`: ISO8601 string
- `encryptedPayload`: string — AES-256-GCM encrypted JSON of action details

Implementation: async write to CloudWatch Logs with encryption wrapper, typed interface `AuditLogEntry`, `Logger` class with `log(entry)` method.

### src/encryption/phi.ts
AES-256-GCM column-level encryption helpers:
- `encrypt(plaintext: string, key: Buffer): { ciphertext: Buffer, iv: Buffer, tag: Buffer }`
- `decrypt(ciphertext: Buffer, key: Buffer, iv: Buffer, tag: Buffer): string`
- `generateKey(): Buffer` — 256-bit key from crypto.randomBytes
- `deriveKey(password: string, salt: Buffer): Buffer` — PBKDF2 key derivation
- TypeScript interfaces: `EncryptedPayload`, `EncryptionOptions`

Node `crypto` module only, no external dependencies.

### terraform/main.tf
Contains:
- AWS provider configuration
- `terraform` block with backend
- `data "aws_availability_zones" "available"`
- VPC module invocation
- `aws_db_instance` (PostgreSQL, encrypted, multi-AZ)
- `aws_db_subnet_group`
- `aws_security_group` for RDS (port 5432 from Lambda SG only)
- `aws_s3_bucket` (data store, encrypted)
- `aws_kms_key` (S3 encryption key)
- `aws_s3_bucket_server_side_encryption_configuration`
- `aws_lambda_function` (API handler)
- `aws_iam_role` (lambda_exec)
- `aws_iam_role_policy` (lambda_policy)
- `aws_security_group` for Lambda (allows egress to RDS, S3, KMS)

### terraform/variables.tf
Variables:
- `aws_region` — AWS region (default: us-east-1)
- `environment` — dev/staging/prod
- `project_name` — prefix for all resources
- `db_instance_class` — e.g. db.t3.medium
- `db_allocated_storage` — in GB
- `db_engine_version` — PostgreSQL version
- `db_backup_retention` — days (0-35)
- `db_username` — RDS master username
- `db_password` — RDS master password (sensitive)
- `vpc_cidr` — VPC CIDR block
- `private_subnets` — list of private subnet CIDRs
- `public_subnets` — list of public subnet CIDRs

### terraform/outputs.tf
Outputs:
- `rds_endpoint` — `aws_db_instance.postgres.address`
- `rds_port` — `aws_db_instance.postgres.port`
- `rds_arn` — `aws_db_instance.postgres.arn`
- `s3_bucket_name` — `aws_s3_bucket.data_store.id`
- `s3_bucket_arn` — `aws_s3_bucket.data_store.arn`
- `lambda_function_name` — `aws_lambda_function.api_handler.function_name`
- `lambda_function_arn` — `aws_lambda_function.api_handler.arn`
- `lambda_role_arn` — `aws_iam_role.lambda_exec.arn`
- `vpc_id` — `module.vpc.vpc_id`
- `kms_key_arn` — `aws_kms_key.s3.arn`

## Done When
- [ ] `src/audit/logger.ts` created with typed AuditLogEntry interface
- [ ] `src/encryption/phi.ts` created with AES-256-GCM encrypt/decrypt
- [ ] `terraform/main.tf` creates VPC, RDS, S3, Lambda, IAM resources
- [ ] `terraform/variables.tf` declares all required variables
- [ ] `terraform/outputs.tf` exports all resource identifiers
- [ ] `terraform validate` passes (no syntax errors)
- [ ] TypeScript files compile without errors (`npx tsc --noEmit`)
