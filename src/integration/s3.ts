import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config/index.js';

const s3 = new S3Client({ region: config.awsRegion });

/**
 * Generate a presigned URL for direct patient document upload to S3.
 * URL is valid for 15 minutes (900 seconds).
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: config.s3BucketName,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

/**
 * Generate a presigned URL for secure document download from S3.
 * URL is valid for 15 minutes (900 seconds).
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn = 900
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.s3BucketName,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

/**
 * Upload a file buffer directly to S3 (for Lambda-to-S3 writes).
 */
export async function uploadFile(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: config.s3BucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });
  await s3.send(command);
  return key;
}

/**
 * Trigger virus scan via S3 event notification → Lambda trigger.
 * The actual scan is handled by the terraform-defined Lambda.
 */
export function triggerVirusScan(key: string): void {
  console.log(`[S3] Virus scan triggered for: ${key}`);
  // S3 event notification fires Lambda virus-scan function on PUT
}
