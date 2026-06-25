import { z } from "zod";

/**
 * Domain enums shared across the API and the web dashboard.
 * These mirror the Prisma enums in `packages/db/prisma/schema.prisma`.
 */
export const Role = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const JobStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  ACTION_REQUIRED: "ACTION_REQUIRED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELED: "CANCELED",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

/** Terminal states a job can no longer transition out of. */
export const TERMINAL_JOB_STATUSES: JobStatus[] = [
  JobStatus.COMPLETED,
  JobStatus.FAILED,
  JobStatus.CANCELED,
];

export const RunType = {
  TASK: "TASK",
  WORKFLOW: "WORKFLOW",
} as const;
export type RunType = (typeof RunType)[keyof typeof RunType];

export const ActionType = {
  TOTP_2FA: "TOTP_2FA",
  CAPTCHA: "CAPTCHA",
  MANUAL_TAKEOVER: "MANUAL_TAKEOVER",
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

export const ActionStatus = {
  WAITING: "WAITING",
  RESOLVED: "RESOLVED",
  EXPIRED: "EXPIRED",
} as const;
export type ActionStatus = (typeof ActionStatus)[keyof typeof ActionStatus];

export const CredentialType = {
  PASSWORD: "PASSWORD",
  API_KEY: "API_KEY",
  CREDIT_CARD: "CREDIT_CARD",
  SECRET: "SECRET",
} as const;
export type CredentialType = (typeof CredentialType)[keyof typeof CredentialType];

/**
 * Maps Skyvern run statuses (lower-case strings from their REST API) onto our
 * internal JobStatus. Unknown statuses fall through to `null` so callers can
 * decide whether to ignore or log them.
 */
export function mapSkyvernStatus(skyvernStatus: string): JobStatus | null {
  switch (skyvernStatus.toLowerCase()) {
    case "created":
    case "queued":
    case "pending":
      return JobStatus.PENDING;
    case "running":
      return JobStatus.RUNNING;
    case "action_required":
    case "waiting":
      return JobStatus.ACTION_REQUIRED;
    case "completed":
      return JobStatus.COMPLETED;
    case "failed":
    case "terminated":
    case "timed_out":
      return JobStatus.FAILED;
    case "canceled":
    case "cancelled":
      return JobStatus.CANCELED;
    default:
      return null;
  }
}

// ---- Zod validators ----

export const createTaskJobSchema = z.object({
  prompt: z.string().min(1),
  url: z.string().url().optional(),
  credentialId: z.string().optional(),
  dataExtractionSchema: z.record(z.unknown()).optional(),
});
export type CreateTaskJobInput = z.infer<typeof createTaskJobSchema>;

export const createWorkflowJobSchema = z.object({
  workflowTemplateId: z.string().min(1),
  parameters: z.record(z.unknown()).optional(),
});
export type CreateWorkflowJobInput = z.infer<typeof createWorkflowJobSchema>;

export const resolveActionSchema = z.object({
  verificationCode: z.string().min(1).max(32),
});
export type ResolveActionInput = z.infer<typeof resolveActionSchema>;

/** Shape Skyvern POSTs to our pull-based TOTP endpoint. */
export const skyvernTotpPullSchema = z.object({
  task_id: z.string().optional(),
  workflow_run_id: z.string().optional(),
  workflow_permanent_id: z.string().optional(),
});
export type SkyvernTotpPull = z.infer<typeof skyvernTotpPullSchema>;
