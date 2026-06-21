/**
 * JWT Authentication Module — RS256 JWT signing/verification
 * Loads keys from PEM files or inline base64 env vars
 */

import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// ─── Key Loading ────────────────────────────────────────────────────────────

function loadPrivateKey(): string {
  const keyPath = process.env.JWT_PRIVATE_KEY_PATH;
  if (keyPath) {
    return readFileSync(keyPath, 'utf-8');
  }
  const inlineKey = process.env.JWT_PRIVATE_KEY;
  if (!inlineKey) {
    throw new Error('JWT_PRIVATE_KEY or JWT_PRIVATE_KEY_PATH must be set');
  }
  return Buffer.from(inlineKey, 'base64').toString('utf-8');
}

function loadPublicKey(): string {
  const keyPath = process.env.JWT_PUBLIC_KEY_PATH;
  if (keyPath) {
    return readFileSync(keyPath, 'utf-8');
  }
  const inlineKey = process.env.JWT_PUBLIC_KEY;
  if (!inlineKey) {
    throw new Error('JWT_PUBLIC_KEY or JWT_PUBLIC_KEY_PATH must be set');
  }
  return Buffer.from(inlineKey, 'base64').toString('utf-8');
}

let privateKey: string | undefined;
let publicKey: string | undefined;

function getPrivateKey(): string {
  if (!privateKey) privateKey = loadPrivateKey();
  return privateKey;
}

function getPublicKey(): string {
  if (!publicKey) publicKey = loadPublicKey();
  return publicKey;
}

// ─── Token Interfaces ────────────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: string;        // userId
  role: string;
  type: 'access';
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;        // userId
  type: 'refresh';
  jti: string;        // unique token ID for revocation
  iat?: number;
  exp?: number;
}

// ─── Sign Access Token (15min expiry) ───────────────────────────────────────

export function signAccessToken(userId: string, role: string): string {
  const payload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
    sub: userId,
    role,
    type: 'access',
  };

  return jwt.sign(payload, getPrivateKey(), {
    algorithm: 'RS256',
    expiresIn: '15m',
  });
}

// ─── Sign Refresh Token (7 day expiry, with jti) ────────────────────────────

export function signRefreshToken(userId: string): { token: string; jti: string } {
  const jti = randomUUID();

  const payload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
    sub: userId,
    type: 'refresh',
    jti,
  };

  const token = jwt.sign(payload, getPrivateKey(), {
    algorithm: 'RS256',
    expiresIn: '7d',
  });

  return { token, jti };
}

// ─── Verify Token ───────────────────────────────────────────────────────────

export function verifyToken(token: string): AccessTokenPayload | RefreshTokenPayload {
  try {
    const payload = jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] }) as
      | AccessTokenPayload
      | RefreshTokenPayload;
    return payload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new Error('Token has expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw err;
  }
}

// ─── Revoke Token (mark jti as used) ────────────────────────────────────────

/**
 * Revokes a refresh token by marking its jti in the revoked_tokens table.
 * Called when a refresh token is used to issue a new access token.
 */
export async function revokeToken(jti: string): Promise<void> {
  // Upsert revoked token with expiry (7 days + buffer)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 8);

  await prisma.revokedToken.upsert({
    where: { jti },
    update: {},
    create: {
      jti,
      expiresAt,
    },
  });
}

// ─── Check if token jti is revoked ─────────────────────────────────────────

export async function isTokenRevoked(jti: string): Promise<boolean> {
  const revoked = await prisma.revokedToken.findUnique({
    where: { jti },
  });
  return !!revoked;
}

// ─── Prisma schema needs RevokedToken model ─────────────────────────────────
// This module expects a RevokedToken model in schema.prisma:
// model RevokedToken {
//   jti       String   @id
//   expiresAt DateTime @map("expires_at")
//   @@map("revoked_tokens")
// }
