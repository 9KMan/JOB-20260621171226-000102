/**
 * MFA Module — TOTP-based Two-Factor Authentication using otplib
 */

import { authenticator } from 'otplib';

/**
 * Generate a new MFA secret for a user.
 * Returns secret, otpauthUrl, and base32 encoding.
 */
export function generateMFAsecret(userEmail: string): {
  secret: string;
  otpauthUrl: string;
  base32: string;
} {
  // Configure authenticator with custom settings
  authenticator.options = {
    step: 30,        // 30-second window
    window: 1,       // allow 1 step before/after for clock drift
  };

  // Generate secret tied to user email
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(userEmail, 'MedPortal', secret);

  return {
    secret,
    otpauthUrl,
    base32: secret,
  };
}

/**
 * Verify a TOTP token against a user's secret.
 * Returns true if valid, false otherwise.
 */
export function verifyMFAtoken(secret: string, token: string): boolean {
  try {
    authenticator.options = {
      step: 30,
      window: 1,
    };

    const isValid = authenticator.verify({ token, secret });
    return isValid;
  } catch {
    return false;
  }
}

/**
 * Generate the otpauth:// URL for QR code generation.
 * Compatible with Google Authenticator, Authy, etc.
 */
export function generateQRCodeURL(secret: string, email: string): string {
  return authenticator.keyuri(email, 'MedPortal', secret);
}
