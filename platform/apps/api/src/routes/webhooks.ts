import { Router, raw } from "express";
import { forOrg, prisma } from "@platform/db";
import { mapSkyvernStatus, JobStatus, TERMINAL_JOB_STATUSES } from "@platform/shared";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { isFreshTimestamp, verifySignature } from "../lib/signature.js";
import { resolveSkyvernApiKey } from "../lib/secrets.js";

/**
 * Inbound endpoints Skyvern calls back into. Mounted with a RAW body parser so
 * signature verification runs against the exact bytes Skyvern signed.
 */
export const webhooksRouter = Router();

const rawJson = raw({ type: "*/*", limit: "5mb" });

webhooksRouter.post(
  "/v1/skyvern/webhook",
  rawJson,
  asyncHandler(async (req, res) => {
    const orgId = String(req.query.org ?? "");
    const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const signature = req.header("x-skyvern-signature");
    const timestamp = req.header("x-skyvern-timestamp");

    const org = orgId ? await prisma.organization.findUnique({ where: { id: orgId } }) : null;
    if (!org) return res.status(404).json({ error: "Unknown organization" });

    const apiKey = await resolveSkyvernApiKey(org);
    const valid = verifySignature(rawBody, signature, apiKey) && isFreshTimestamp(timestamp);

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody.toString("utf8") || "{}");
    } catch {
      payload = {};
    }
    const runId = String(payload.run_id ?? payload.task_id ?? "") || null;

    // Always persist the raw event first (source of truth), before processing.
    await prisma.webhookEvent.create({
      data: {
        organizationId: org.id,
        skyvernRunId: runId,
        eventType: typeof payload.status === "string" ? `run.${payload.status}` : null,
        signatureValid: valid,
        rawPayload: payload as never,
        headers: {
          "x-skyvern-signature": signature ?? null,
          "x-skyvern-timestamp": timestamp ?? null,
        } as never,
        processingStatus: valid ? "RECEIVED" : "REJECTED_SIGNATURE",
      },
    });

    if (!valid) return res.status(401).json({ error: "Invalid signature" });

    // Correlate to a job (tenant-scoped) and apply the status transition.
    if (runId) {
      const db = forOrg(org.id);
      const job = await db.automationJob.findFirst({ where: { skyvernRunId: runId } });
      if (job && !TERMINAL_JOB_STATUSES.includes(job.status as JobStatus)) {
        const mapped = payload.status ? mapSkyvernStatus(String(payload.status)) : null;
        if (mapped) {
          await db.automationJob.update({
            where: { id: job.id },
            data: {
              status: mapped,
              output: (payload.output as never) ?? job.output,
              recordingUrl: (payload.recording_url as string) ?? job.recordingUrl,
              appUrl: (payload.app_url as string) ?? job.appUrl,
              finishedAt: TERMINAL_JOB_STATUSES.includes(mapped) ? new Date() : job.finishedAt,
            },
          });
        }
      }
    }

    res.json({ received: true });
  }),
);
