/**
 * Centralized environment access for the API service. Keeping this in one place
 * makes it easy to swap the Skyvern key lookup for a real secrets manager later.
 */
export const env = {
  port: Number(process.env.API_PORT ?? 4000),
  publicUrl: process.env.API_PUBLIC_URL ?? "http://localhost:4000",
  skyvern: {
    baseUrl: process.env.SKYVERN_BASE_URL ?? "http://localhost:8000",
    /** Dev fallback only; production resolves a per-tenant key from a secrets manager. */
    devApiKey: process.env.SKYVERN_API_KEY ?? "dev-skyvern-api-key",
  },
  nodeEnv: process.env.NODE_ENV ?? "development",
};
