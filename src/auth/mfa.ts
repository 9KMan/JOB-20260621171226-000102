import { authenticator } from 'otplib';
import { config } from '../config/index.js';

// Configure authenticator
authenticator.options = {
  step: 30,        // 30-second window
  window: 1,       // allow 1 step before/after
};

export interface MFASecret {
  secret: string;
  otpauthUrl: string;
  base32: string;
}

export function generateMFAsecret(userEmail: string): MFASecret {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(userEmail, 'MedPortal', secret);
  return { secret, otpauthUrl, base32: secret };
}

export function verifyMFAtoken(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

export function generateQRCodeDataURL(otpauthUrl: string): Promise<string> {
  // Returns data URL for QR code (used during enrollment)
  // Actual QR generation happens client-side with the otpauthUrl
  return Promise.resolve(otpauthUrl);
}
