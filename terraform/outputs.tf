output "rds_endpoint" {
  description = "RDS PostgreSQL connection endpoint"
  value       = aws_db_instance.main.endpoint
}

output "rds_port" {
  description = "RDS PostgreSQL port"
  value       = aws_db_instance.main.port
}

output "s3_documents_bucket" {
  description = "S3 bucket name for patient documents"
  value       = aws_s3_bucket.documents.bucket
}

output "s3_audit_bucket" {
  description = "S3 bucket name for audit logs"
  value       = aws_s3_bucket.audit_logs.bucket
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "lambda_function_arns" {
  description = "ARNs of Lambda functions"
  value       = {
    ehr_webhook  = aws_lambda_function.process_ehr_webhook.arn
    audit_flush  = aws_lambda_function.audit_log_flush.arn
  }
}
