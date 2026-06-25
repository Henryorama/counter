import { prisma, type OrgScopedClient } from "@platform/db";
import { JobStatus, RunType } from "@platform/shared";
import { env } from "../env.js";
import { resolveSkyvernApiKey } from "../lib/secrets.js";
import type { SkyvernClient } from "../skyvern/client.js";

/**
 * Business logic for automation jobs. Kept out of the route handlers so the same
 * services can back a future public REST API (the "API-ready seam").
 */

interface CreateTaskJobArgs {
  db: OrgScopedClient;
  organizationId: string;
  userId: string;
  skyvern: SkyvernClient;
  prompt: string;
  url?: string;
  credentialId?: string;
  dataExtractionSchema?: Record<string, unknown>;
}

export async function createTaskJob(args: CreateTaskJobArgs) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: args.organizationId },
  });
  const apiKey = await resolveSkyvernApiKey(org);

  // 1. Create the job in PENDING so we have an id to correlate webhooks against.
  const job = await args.db.automationJob.create({
    data: {
      createdByUserId: args.userId,
      credentialId: args.credentialId,
      runType: RunType.TASK,
      status: JobStatus.PENDING,
      prompt: args.prompt,
      inputParams: args.url ? { url: args.url } : undefined,
    } as never,
  });

  // 2. Per-tenant callback URLs so the webhook/TOTP receivers know the org.
  const webhookUrl = `${env.publicUrl}/v1/skyvern/webhook?org=${args.organizationId}`;
  const totpUrl = `${env.publicUrl}/v1/skyvern/totp?org=${args.organizationId}`;

  // 3. Trigger Skyvern over REST and record the run id.
  try {
    const run = await args.skyvern.runTask({
      apiKey,
      prompt: args.prompt,
      url: args.url,
      webhookUrl,
      totpUrl,
      dataExtractionSchema: args.dataExtractionSchema,
    });

    return args.db.automationJob.update({
      where: { id: job.id },
      data: {
        skyvernRunId: run.run_id,
        status: JobStatus.RUNNING,
        startedAt: new Date(),
      },
    });
  } catch (err) {
    await args.db.automationJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.FAILED,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

export function listJobs(db: OrgScopedClient) {
  return db.automationJob.findMany({
    orderBy: { createdAt: "desc" },
    include: { actionRequests: { where: { status: "WAITING" } } },
    take: 100,
  });
}

export function getJob(db: OrgScopedClient, id: string) {
  return db.automationJob.findFirst({
    where: { id },
    include: { actionRequests: true },
  });
}
