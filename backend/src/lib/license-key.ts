import crypto from "node:crypto";

/**
 * License key generation with HMAC-SHA256 checksum.
 *
 * Format: CCF-XXXX-XXXX-XXXX-XXXX
 * Character set excludes ambiguous chars (I, O, 0, 1).
 * The last 2 characters of the final group are an HMAC checksum.
 */

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars, no I/O/0/1

function getHmacSecret(): string {
  const secret = process.env.CCF_HMAC_SECRET;
  if (!secret) {
    throw new Error("CCF_HMAC_SECRET environment variable is not set");
  }
  return secret;
}

function randomChars(count: number): string {
  const bytes = crypto.randomBytes(count);
  let result = "";
  for (let i = 0; i < count; i++) {
    result += CHARSET[bytes[i]! % CHARSET.length];
  }
  return result;
}

function computeChecksum(body: string): string {
  const secret = getHmacSecret();
  const hmac = crypto.createHmac("sha256", secret).update(body).digest("hex");
  // Map first 2 hex bytes into our charset
  const b0 = parseInt(hmac.substring(0, 2), 16);
  const b1 = parseInt(hmac.substring(2, 4), 16);
  return CHARSET[b0 % CHARSET.length]! + CHARSET[b1 % CHARSET.length]!;
}

/**
 * Generate a new license key with embedded HMAC checksum.
 *
 * @returns A key in the format CCF-XXXX-XXXX-XXXX-XXXX
 */
export function generateLicenseKey(): string {
  // Generate 14 random chars (4+4+4+2), then append 2-char checksum
  const g1 = randomChars(4);
  const g2 = randomChars(4);
  const g3 = randomChars(4);
  const g4Prefix = randomChars(2);

  const body = `CCF-${g1}-${g2}-${g3}-${g4Prefix}`;
  const checksum = computeChecksum(body);

  return `${body}${checksum}`;
}

/**
 * Validate a license key's HMAC checksum.
 */
export function validateLicenseKeyChecksum(key: string): boolean {
  if (!/^CCF-(?:TRIAL-)?[A-Z2-9]{4,5}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4,5}$/.test(key)) {
    return false;
  }

  const body = key.slice(0, -2); // everything except last 2 chars
  const providedChecksum = key.slice(-2);
  const expectedChecksum = computeChecksum(body);

  // Use constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(providedChecksum), Buffer.from(expectedChecksum));
}
