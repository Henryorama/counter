import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "@platform/db";
import { createApp } from "./app.js";
import { generateSignature } from "./lib/signature.js";
import { _clearAllForTests } from "./lib/codeStore.js";
import type { SkyvernClient } from "./skyvern/client.js";

/**
 * End-to-end API test against a real Postgres with a stubbed Skyvern client.
 * Exercises: org context auth, job creation/dispatch, the webhook receiver
 * (signature verify + status transition), and the full pull-based 2FA loop.
 */

const DEV_KEY = process.env.SKYVERN_API_KEY ?? "dev-skyvern-api-key";

// Stub Skyvern: returns a deterministic run id, records nothing else.
const stubSkyvern: SkyvernClient = {
  async runTask() {
    return { run_id: `tsk_test_${Math.random().toString(36).slice(2, 8)}` };
  },
  async runWorkflow() {
    return { run_id: "wr_test" };
  },
  async runLogin() {
    return { run_id: "tsk_login_test" };
  },
  async getRun(_k, runId) {
    return { run_id: runId, status: "running" };
  },
  async pushTotp() {
    return {};
  },
};

describe("API end-to-end", () => {
  const app = createApp({ skyvern: stubSkyvern });
  const suffix = Math.random().toString(36).slice(2, 8);
  let orgId = "";
  let userId = "";

  beforeAll(async () => {
    _clearAllForTests();
    const org = await prisma.organization.create({
      data: { name: `E2E ${suffix}`, slug: `e2e-${suffix}` },
    });
    const user = await prisma.user.create({
      data: { email: `e2e-${suffix}@example.com`, name: "E2E" },
    });
    await prisma.membership.create({
      data: { userId: user.id, organizationId: org.id, role: "OWNER" },
    });
    orgId = org.id;
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const auth = (r: request.Test) => r.set("x-user-id", userId).set("x-org-id", orgId);

  it("rejects requests without org context", async () => {
    const res = await request(app).get("/v1/jobs");
    expect(res.status).toBe(401);
  });

  it("healthz reports db up", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.db).toBe("up");
  });

  it("creates and dispatches a job to Skyvern", async () => {
    const res = await auth(
      request(app).post("/v1/jobs").send({ prompt: "Check claim status", url: "https://portal.example" }),
    );
    expect(res.status).toBe(201);
    expect(res.body.job.status).toBe("RUNNING");
    expect(res.body.job.skyvernRunId).toMatch(/^tsk_test_/);
  });

  it("runs the full pull-based 2FA loop", async () => {
    // 1. Create a job and grab its run id.
    const create = await auth(request(app).post("/v1/jobs").send({ prompt: "Login and download" }));
    const runId: string = create.body.job.skyvernRunId;
    const jobId: string = create.body.job.id;

    const signed = (path: string, payload: object) => {
      const body = JSON.stringify(payload);
      return request(app)
        .post(path)
        .set("content-type", "application/json")
        .set("x-skyvern-signature", generateSignature(body, DEV_KEY))
        .set("x-skyvern-timestamp", String(Math.floor(Date.now() / 1000)))
        .send(body);
    };

    // 2. Skyvern polls for a TOTP code; none yet -> 204 and job becomes ACTION_REQUIRED.
    const poll1 = await signed(`/v1/skyvern/totp?org=${orgId}`, { task_id: runId });
    expect(poll1.status).toBe(204);

    const afterPoll = await auth(request(app).get(`/v1/jobs/${jobId}`));
    expect(afterPoll.body.job.status).toBe("ACTION_REQUIRED");
    const action = afterPoll.body.job.actionRequests.find((a: any) => a.status === "WAITING");
    expect(action).toBeTruthy();
    expect(action.type).toBe("TOTP_2FA");

    // 3. Operator submits the code via the UI-facing endpoint.
    const resolve = await auth(
      request(app).post(`/v1/jobs/${jobId}/actions/${action.id}/resolve`).send({
        verificationCode: "424242",
      }),
    );
    expect(resolve.status).toBe(200);
    expect(resolve.body.action.status).toBe("RESOLVED");

    // 4. Skyvern's next poll receives the code.
    const poll2 = await signed(`/v1/skyvern/totp?org=${orgId}`, { task_id: runId });
    expect(poll2.status).toBe(200);
    expect(poll2.body.verification_code).toBe("424242");

    // 5. Skyvern reports completion via a signed webhook.
    const webhook = await signed(`/v1/skyvern/webhook?org=${orgId}`, {
      run_id: runId,
      status: "completed",
      output: { ok: true },
      recording_url: "https://rec.example/x.mp4",
    });
    expect(webhook.status).toBe(200);

    const done = await auth(request(app).get(`/v1/jobs/${jobId}`));
    expect(done.body.job.status).toBe("COMPLETED");
    expect(done.body.job.recordingUrl).toBe("https://rec.example/x.mp4");
  });

  it("rejects a webhook with a bad signature", async () => {
    const res = await request(app)
      .post(`/v1/skyvern/webhook?org=${orgId}`)
      .set("content-type", "application/json")
      .set("x-skyvern-signature", "deadbeef")
      .send(JSON.stringify({ run_id: "tsk_x", status: "completed" }));
    expect(res.status).toBe(401);
  });
});
