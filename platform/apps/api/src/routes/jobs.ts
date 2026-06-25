import { Router } from "express";
import { createTaskJobSchema, resolveActionSchema, ActionStatus, JobStatus } from "@platform/shared";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireOrgContext } from "../middleware/context.js";
import { createTaskJob, getJob, listJobs } from "../services/jobService.js";
import { putCode } from "../lib/codeStore.js";
import type { SkyvernClient } from "../skyvern/client.js";

export function jobsRouter(skyvern: SkyvernClient): Router {
  const router = Router();

  // List jobs for the active organization.
  router.get(
    "/v1/jobs",
    requireOrgContext,
    asyncHandler(async (req, res) => {
      const jobs = await listJobs(req.ctx!.db);
      res.json({ jobs });
    }),
  );

  // Create + dispatch a task job to Skyvern.
  router.post(
    "/v1/jobs",
    requireOrgContext,
    asyncHandler(async (req, res) => {
      const input = createTaskJobSchema.parse(req.body);
      const job = await createTaskJob({
        db: req.ctx!.db,
        organizationId: req.ctx!.organizationId,
        userId: req.ctx!.userId,
        skyvern,
        prompt: input.prompt,
        url: input.url,
        credentialId: input.credentialId,
        dataExtractionSchema: input.dataExtractionSchema,
      });
      res.status(201).json({ job });
    }),
  );

  router.get(
    "/v1/jobs/:id",
    requireOrgContext,
    asyncHandler(async (req, res) => {
      const job = await getJob(req.ctx!.db, req.params.id!);
      if (!job) return res.status(404).json({ error: "Job not found" });
      res.json({ job });
    }),
  );

  // Human-in-the-loop: operator submits a 2FA code to resolve an ACTION_REQUIRED.
  router.post(
    "/v1/jobs/:id/actions/:actionId/resolve",
    requireOrgContext,
    asyncHandler(async (req, res) => {
      const { verificationCode } = resolveActionSchema.parse(req.body);
      const db = req.ctx!.db;

      const job = await getJob(db, req.params.id!);
      if (!job) return res.status(404).json({ error: "Job not found" });

      const action = job.actionRequests.find((a) => a.id === req.params.actionId);
      if (!action) return res.status(404).json({ error: "Action not found" });
      if (action.status !== ActionStatus.WAITING) {
        return res.status(409).json({ error: `Action already ${action.status}` });
      }
      if (!job.skyvernRunId) {
        return res.status(409).json({ error: "Job has no Skyvern run to resume" });
      }

      // Stash the code for Skyvern's next poll (short-TTL, one-time use).
      putCode(job.skyvernRunId, verificationCode);

      await db.automationJob.update({
        where: { id: job.id },
        data: { status: JobStatus.RUNNING },
      });

      // ActionRequest is scoped via its parent job (ownership verified above),
      // so it is not part of the org-scoped model set.
      const updatedAction = await db.actionRequest.update({
        where: { id: action.id },
        data: {
          status: ActionStatus.RESOLVED,
          resolvedByUserId: req.ctx!.userId,
          resolvedAt: new Date(),
        },
      });

      await db.auditLog.create({
        data: {
          actorUserId: req.ctx!.userId,
          action: "ACTION_RESOLVED",
          targetType: "ActionRequest",
          targetId: action.id,
          metadata: { jobId: job.id, type: action.type },
        } as never,
      });

      res.json({ action: updatedAction });
    }),
  );

  return router;
}
