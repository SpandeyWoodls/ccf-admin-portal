import crypto from "crypto";

/**
 * Generate an HMAC-SHA256 validation token for offline license validation.
 *
 * The desktop app (Rust) verifies this token locally between server check-ins
 * using the same HMAC secret. The token contains all fields needed for
 * offline validation, signed with the shared secret.
 */
export function generateValidationToken(
  licenseKey: string,
  hardwareFingerprint: string,
  validatedAt: string,
  expiresAt: string | null,
): string {
  const secret = process.env.CCF_HMAC_SECRET || "";
  // When expires_at is null/empty (perpetual license), use "perpetual" in signing data
  // to match Rust's: token_data.expires_at.as_deref().unwrap_or("perpetual")
  const expiresForSigning = expiresAt || "perpetual";
  const data = `${licenseKey}:${hardwareFingerprint}:${validatedAt}:${expiresForSigning}`;
  const signature = crypto.createHmac("sha256", secret).update(data).digest("hex");

  const token = {
    license_key: licenseKey,
    hardware_fingerprint: hardwareFingerprint,
    validated_at: validatedAt,
    // Send null (not "") for perpetual licenses so Rust deserializes as None
    expires_at: expiresAt || null,
    signature: signature,
  };

  return Buffer.from(JSON.stringify(token)).toString("base64");
}

/**
 * Derive a stable numeric license ID from a UUID string.
 *
 * The desktop app expects `license_id` as an integer, but our database uses
 * UUIDs. We hash the UUID and take the first 8 hex chars (32 bits) to produce
 * a deterministic positive integer that fits in a u32/i64.
 */
export function uuidToNumericId(uuid: string): number {
  const hash = crypto.createHash("md5").update(uuid).digest("hex");
  // Take first 7 hex chars to stay within safe integer range (0 .. 268_435_455)
  return parseInt(hash.substring(0, 7), 16);
}
