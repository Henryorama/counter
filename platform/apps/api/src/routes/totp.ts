import { Router, raw } from "express";
import { forOrg, prisma } from "@platform/db";
import { ActionStatus, ActionType, JobStatus, skyvernTotpPullSchema } from "@platform/shared";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { isFreshTimestamp, verifySignature } from "../lib/signature.js";
import { resolveSkyvernApiKey } from "../lib/secrets.js";
import { takeCode } from "../lib/codeStore.js";

/**
 * Pull-based 2FA endpoint. Skyvern polls this (~every 10s, up to 15 min) when a
 * login hits a 2FA wall:
 *   - If a human has already submitted a code, return { verification_code }.
 *   - Otherwise mark the job ACTION_REQUIRED (so the UI prompts an operator) and
 *     respond without a code; Skyvern keeps polling.
 */
export const totpRouter = Router();

const rawJson = raw({ type: "*/*", limit: "1mb" });

totpRouter.post(
  "/v1/skyvern/totp",
  rawJson,
  asyncHandler(async (req, res) => {
    const orgId = String(req.query.org ?? "");
    const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const signature = req.header("x-skyvern-signature");
    const timestamp = req.header("x-skyvern-timestamp");

    const org = orgId ? await prisma.organization.findUnique({ where: { id: orgId } }) : null;
    if (!org) return res.status(404).json({ error: "Unknown organization" });

    const apiKey = await resolveSkyvernApiKey(org);
    if (!verifySignature(rawBody, signature, apiKey) || !isFreshTimestamp(timestamp)) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const body = skyvernTotpPullSchema.parse(JSON.parse(rawBody.toString("utf8") || "{}"));
    const runId = body.task_id ?? body.workflow_run_id ?? null;
    if (!runId) return res.status(400).json({ error: "Missing run identifier" });

    // Operator already supplied a code? Deliver it and let the login resume.
    const code = takeCode(runId);
    if (code) {
      return res.json({ verification_code: code });
    }

    // No code yet -> ensure the job/action reflect that a human is needed.
    const db = forOrg(org.id);
    const job = await db.automationJob.findFirst({ where: { skyvernRunId: runId } });
    if (job) {
      if (job.status !== JobStatus.ACTION_REQUIRED) {
        await db.automationJob.update({
          where: { id: job.id },
          data: { status: JobStatus.ACTION_REQUIRED },
        });
      }
      const existing = await db.actionRequest.findFirst({
        where: { jobId: job.id, type: ActionType.TOTP_2FA, status: ActionStatus.WAITING },
      });
      if (!existing) {
        await db.actionRequest.create({
          data: {
            jobId: job.id,
            type: ActionType.TOTP_2FA,
            status: ActionStatus.WAITING,
            context: { reason: "Skyvern requested a verification code." },
            expiresAt: new Date(Date.now() + 1000 * 60 * 15),
          },
        });
        // TODO(prod): emit real-time notification (WebSocket/SSE) + email here.
      }
    }

    // 204: acknowledged, no code available yet — Skyvern will poll again.
    res.status(204).end();
  }),
);
