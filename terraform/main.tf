terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_availability_zones" "available" {
  state = "available"
}

# VPC
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = { Name = "${var.project_name}-vpc", Environment = var.environment }
}

# Subnets
resource "aws_subnet" "public" {
  count = 3
  vpc_id = aws_vpc.main.id
  cidr_block = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = false
  tags = { Name = "${var.project_name}-public-${count.index + 1}", Tier = "Public" }
}

resource "aws_subnet" "app" {
  count = 3
  vpc_id = aws_vpc.main.id
  cidr_block = cidrsubnet(var.vpc_cidr, 4, 3 + count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = false
  tags = { Name = "${var.project_name}-app-${count.index + 1}", Tier = "Private" }
}

resource "aws_subnet" "data" {
  count = 3
  vpc_id = aws_vpc.main.id
  cidr_block = cidrsubnet(var.vpc_cidr, 4, 6 + count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = false
  tags = { Name = "${var.project_name}-data-${count.index + 1}", Tier = "Data" }
}

# NAT Gateway
resource "aws_eip" "nat" { count = 3; domain = "vpc" }
resource "aws_nat_gateway" "main" {
  count = 3
  subnet_id = aws_subnet.public[count.index].id
  allocation_id = aws_eip.nat[count.index].id
  connectivity_type = "public"
}

# Route Tables
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route { cidr_block = "0.0.0.0/0"; gateway_id = aws_internet_gateway.main.id }
}
resource "aws_route_table" "private" {
  count = 3
  vpc_id = aws_vpc.main.id
  route { cidr_block = "0.0.0.0/0"; nat_gateway_id = aws_nat_gateway.main[count.index].id }
}
resource "aws_route_table_association" "public" { count = 3; subnet_id = aws_subnet.public[count.index].id; route_table_id = aws_route_table.public.id }
resource "aws_route_table_association" "app" { count = 3; subnet_id = aws_subnet.app[count.index].id; route_table_id = aws_route_table.private[count.index].id }
resource "aws_route_table_association" "data" { count = 3; subnet_id = aws_subnet.data[count.index].id; route_table_id = aws_route_table.private[count.index].id }

# Internet Gateway
resource "aws_internet_gateway" "main" { vpc_id = aws_vpc.main.id; tags = { Name = "${var.project_name}-igw" } }

# KMS Key
resource "aws_kms_key" "rds" {
  description = "KMS key for RDS and S3 encryption"
  enable_key_rotation = true
}
resource "aws_kms_alias" "rds" { name = "alias/medportal-rds"; target_key_id = aws_kms_key.rds.key_id }

# RDS Subnet Group + Instance
resource "aws_db_subnet_group" "main" {
  name = "${var.project_name}-db-subnet-group"
  subnet_ids = aws_subnet.data[*].id
}
resource "aws_db_parameter_group" "pgaudit" {
  name = "${var.project_name}-pgaudit"
  family = "postgres15"
  parameter { name = "pgaudit.log"; value = "READ, WRITE, FUNCTION, ROLE" }
}
resource "aws_db_instance" "main" {
  identifier = "${var.project_name}-postgres"
  engine = "postgres"; engine_version = "15.5"
  instance_class = var.db_instance_class
  allocated_storage = var.db_allocated_storage
  storage_encrypted = true; storage_type = "gp3"
  kms_key_id = aws_kms_key.rds.arn
  db_name = "medportal"; username = "medportal_admin"
  password = "REPLACE_WITH_SECRETS_MANAGER"
  db_subnet_group_name = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name = aws_db_parameter_group.pgaudit.name
  multi_az = var.environment == "prod" ? true : false
  backup_retention_period = 30
  skip_final_snapshot = var.environment != "prod"
  publicly_accessible = false
}

# S3 Documents Bucket
resource "aws_s3_bucket" "documents" { bucket = "${var.project_name}-documents-${var.environment}" }
resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule { apply_server_side_encryption_by_default { sse_algorithm = "aws:kms"; kms_master_key_id = aws_kms_key.rds.arn } }
}
resource "aws_s3_bucket_versioning" "documents" { bucket = aws_s3_bucket.documents.id; versioning_configuration { status = "Enabled" } }
resource "aws_s3_bucket_lifecycle" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule { id = "archive"; status = "Enabled"; transition { days = 90; storage_class = "GLACIER" } }
}

# S3 Audit Logs Bucket (Immutable)
resource "aws_s3_bucket" "audit_logs" { bucket = "${var.project_name}-audit-logs-${var.environment}" }
resource "aws_s3_bucket_server_side_encryption_configuration" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id
  rule { apply_server_side_encryption_by_default { sse_algorithm = "aws:kms"; kms_master_key_id = aws_kms_key.rds.arn } }
}
resource "aws_s3_bucket_lifecycle" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id
  rule { id = "deep-archive"; status = "Enabled"; transition { days = 365; storage_class = "DEEP_ARCHIVE" } }
}

# Security Groups
resource "aws_security_group" "rds" {
  name = "${var.project_name}-rds-sg"; vpc_id = aws_vpc.main.id
  ingress { from_port = 5432; to_port = 5432; protocol = "tcp"; security_groups = [aws_security_group.app.id] }
  egress { from_port = 0; to_port = 0; protocol = "-1"; cidr_blocks = ["0.0.0.0/0"] }
}
resource "aws_security_group" "app" {
  name = "${var.project_name}-app-sg"; vpc_id = aws_vpc.main.id
  ingress { from_port = 3000; to_port = 3000; protocol = "tcp"; cidr_blocks = ["0.0.0.0/0"] }
  egress { from_port = 0; to_port = 0; protocol = "-1"; cidr_blocks = ["0.0.0.0/0"] }
}

# Lambda Execution Role
resource "aws_iam_role" "lambda_exec" {
  name = "${var.project_name}-lambda-exec-role"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "lambda.amazonaws.com" } }] })
}
