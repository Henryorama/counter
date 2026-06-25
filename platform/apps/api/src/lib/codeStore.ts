/**
 * Short-TTL store for human-supplied 2FA codes that bridge the operator's UI
 * submission and Skyvern's next poll of our pull endpoint.
 *
 * This in-memory implementation is for local dev only. In production this is a
 * short-TTL secret (Redis with EX, or Secrets Manager) so codes never persist
 * and are isolated per instance. Codes are keyed by Skyvern run id.
 */
const store = new Map<string, { code: string; expiresAt: number }>();

const DEFAULT_TTL_MS = 1000 * 60 * 15; // matches Skyvern's 15-min poll timeout

export function putCode(runId: string, code: string, ttlMs = DEFAULT_TTL_MS): void {
  store.set(runId, { code, expiresAt: Date.now() + ttlMs });
}

export function takeCode(runId: string): string | null {
  const entry = store.get(runId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(runId);
    return null;
  }
  // One-time use: remove once delivered to Skyvern.
  store.delete(runId);
  return entry.code;
}

export function _clearAllForTests(): void {
  store.clear();
}
