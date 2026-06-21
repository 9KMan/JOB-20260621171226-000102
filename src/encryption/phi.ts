import https from 'https';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function deriveKey(masterKey: string): Buffer {
  return require('crypto').createHash('sha256').update(masterKey).digest();
}

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = require('crypto').randomBytes(IV_LENGTH);
  const cipher = require('crypto').createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, Buffer.from(ciphertext, 'base64'), tag]);
  return combined.toString('base64');
}

export function decrypt(ciphertext: string, key: Buffer): string {
  const combined = Buffer.from(ciphertext, 'base64');
  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(combined.length - TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);
  const decipher = require('crypto').createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  let plaintext = decipher.update(encrypted);
  plaintext = Buffer.concat([plaintext, decipher.final()]);
  return plaintext.toString('utf8');
}
