import type { Organization } from "@platform/db";
import { env } from "../env.js";

/**
 * Resolves the Skyvern API key used to sign/verify a tenant's traffic.
 *
 * In production this reads `organization.skyvernApiKeyRef` from a secrets
 * manager (AWS Secrets Manager). In dev we fall back to a single env key so the
 * service is runnable without external infra.
 */
export async function resolveSkyvernApiKey(org: Pick<Organization, "skyvernApiKeyRef">): Promise<string> {
  if (org.skyvernApiKeyRef) {
    // TODO(prod): fetch from AWS Secrets Manager by ARN `org.skyvernApiKeyRef`.
    return org.skyvernApiKeyRef;
  }
  return env.skyvern.devApiKey;
}
