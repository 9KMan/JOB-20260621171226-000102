import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

interface Config {
  port: number;
  databaseUrl: string;
  jwtPublicKey: string;
  jwtPrivateKey: string;
  awsRegion: string | undefined;
  s3BucketName: string | undefined;
  athenaClientId: string | undefined;
  athenaClientSecret: string | undefined;
  encryptionKey: string | undefined;
  nodeEnv: string;
}

const requiredFields = ['DATABASE_URL', 'JWT_PUBLIC_KEY', 'JWT_PRIVATE_KEY'];

for (const field of requiredFields) {
  if (!process.env[field]) {
    throw new Error(`Missing required environment variable: ${field}`);
  }
}

export const config: Config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: process.env.DATABASE_URL!,
  jwtPublicKey: process.env.JWT_PUBLIC_KEY!,
  jwtPrivateKey: process.env.JWT_PRIVATE_KEY!,
  awsRegion: process.env.AWS_REGION,
  s3BucketName: process.env.S3_BUCKET_NAME,
  athenaClientId: process.env.ATHENA_CLIENT_ID,
  athenaClientSecret: process.env.ATHENA_CLIENT_SECRET,
  encryptionKey: process.env.ENCRYPTION_KEY,
  nodeEnv: process.env.NODE_ENV ?? 'development',
};
