import jwt from 'jsonwebtoken';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { config } from '../config/index.js';

export interface AccessTokenPayload {
  sub: string;  // user ID
  role: string;
  type: 'access';
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;   // JWT ID for revocation
  type: 'refresh';
  iat: number;
  exp: number;
}

function loadPemKey(keyPath: string, keyContent: string): string {
  if (keyPath && fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8');
  }
  // Assume base64-encoded PEM if not a path
  if (keyContent.includes('BEGIN')) return keyContent;
  // base64 -> PEM
  const lines = keyContent.match(/.{1,64}/g) || [];
  const header = keyContent.includes('PRIVATE') ? 'RSA PRIVATE KEY' : 'RSA PUBLIC KEY';
  return `-----BEGIN ${header}-----\n${lines.join('\n')}\n-----END ${header}-----\n`;
}

const privateKey = loadPemKey('', config.jwtPrivateKey);
const publicKey = loadPemKey('', config.jwtPublicKey);

export function signAccessToken(userId: string, role: string): string {
  return jwt.sign(
    { sub: userId, role, type: 'access' },
    privateKey,
    { algorithm: 'RS256', expiresIn: config.jwtAccessTtl }
  );
}

export function signRefreshToken(userId: string, jti?: string): string {
  const tokenId = jti || randomUUID();
  return jwt.sign(
    { sub: userId, jti: tokenId, type: 'refresh' },
    privateKey,
    { algorithm: 'RS256', expiresIn: config.jwtRefreshTtl }
  );
}

export function verifyToken(token: string): AccessTokenPayload | RefreshTokenPayload {
  return jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as AccessTokenPayload | RefreshTokenPayload;
}

export function decodeToken(token: string): AccessTokenPayload | RefreshTokenPayload | null {
  return jwt.decode(token) as AccessTokenPayload | RefreshTokenPayload | null;
}

// ─── Token Revocation (in-memory — use Redis/DB in production) ────────────────
// NOTE: In-memory Set is lost on restart. For production, add a RevokedToken
// model to schema.prisma and persist revocation there.

const revokedTokens = new Set<string>();

export async function revokeToken(jti: string): Promise<void> {
  revokedTokens.add(jti);
}

export async function isTokenRevoked(jti: string): Promise<boolean> {
  return revokedTokens.has(jti);
}
