import crypto from "node:crypto";

/**
 * Skyvern signs every webhook (and pull-based TOTP request) with the
 * organization's API key using HMAC-SHA256 over the raw request body, sending:
 *   - x-skyvern-signature: hex HMAC-SHA256 of the payload
 *   - x-skyvern-timestamp: unix seconds when the webhook was sent
 *
 * We MUST verify against the raw bytes as received — re-serializing the JSON
 * changes the byte representation (Skyvern uses compact separators and turns
 * whole-number floats like 3.0 into 3) and breaks the signature.
 */
export function generateSignature(rawBody: Buffer | string, apiKey: string): string {
  return crypto.createHmac("sha256", apiKey).update(rawBody).digest("hex");
}

/** Constant-time signature comparison. Returns false on any malformed input. */
export function verifySignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  apiKey: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = generateSignature(rawBody, apiKey);
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Rejects stale requests to blunt replay attacks. `timestampHeader` is unix
 * seconds; default tolerance is 5 minutes of clock skew.
 */
export function isFreshTimestamp(
  timestampHeader: string | undefined,
  toleranceSeconds = 300,
  now: number = Date.now(),
): boolean {
  if (!timestampHeader) return true; // timestamp is optional; don't hard-fail when absent
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) return false;
  const ageSeconds = Math.abs(now / 1000 - ts);
  return ageSeconds <= toleranceSeconds;
}
