import 'dotenv/config';

interface Config {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  jwtPublicKey: string;
  jwtPrivateKey: string;
  jwtAccessTtl: string;
  jwtRefreshTtl: string;
  encryptionKey: string;
  awsRegion: string;
  s3BucketName: string;
  athenaClientId: string;
  athenaClientSecret: string;
  athenaWebhookSecret: string;
  corsOrigin: string;
}

function required(key: string, fallback?: string): string {
  const value = process.env[key] || fallback;
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const config: Config = {
  port: parseInt(required('PORT', '3000'), 10),
  nodeEnv: required('NODE_ENV', 'development'),
  databaseUrl: required('DATABASE_URL'),
  jwtPublicKey: required('JWT_PUBLIC_KEY') || required('JWT_PUBLIC_KEY_PATH'),
  jwtPrivateKey: required('JWT_PRIVATE_KEY') || required('JWT_PRIVATE_KEY_PATH'),
  jwtAccessTtl: required('JWT_ACCESS_TTL', '15m'),
  jwtRefreshTtl: required('JWT_REFRESH_TTL', '7d'),
  encryptionKey: required('ENCRYPTION_KEY'),
  awsRegion: required('AWS_REGION', 'us-east-1'),
  s3BucketName: required('S3_BUCKET_NAME'),
  athenaClientId: required('ATHENA_CLIENT_ID'),
  athenaClientSecret: required('ATHENA_CLIENT_SECRET'),
  athenaWebhookSecret: required('ATHENA_WEBHOOK_SECRET'),
  corsOrigin: required('CORS_ORIGIN', '*'),
};
