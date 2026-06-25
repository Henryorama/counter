import "dotenv/config";
import express from "express";
import { generateSignature } from "../lib/signature.js";

/**
 * DEV-ONLY mock of the self-hosted Skyvern REST API. It lets you exercise the
 * full job lifecycle (dispatch -> 2FA prompt -> resume -> completion webhook)
 * without running a real Skyvern instance. NOT for production use.
 *
 * Behaviour:
 *   POST /v1/run/tasks      -> returns a run_id, then drives callbacks:
 *     - if a totp_url is provided, it polls that endpoint (simulating a 2FA
 *       wall) until it receives a verification_code, then fires a completion
 *       webhook.
 *     - otherwise it fires a completion webhook after a short delay.
 *   POST /v1/run/workflows  -> same completion behaviour.
 *   POST /v1/credentials/totp / GET /v1/runs/:id -> simple acks.
 */

const PORT = Number(process.env.MOCK_SKYVERN_PORT ?? 8000);
const API_KEY = process.env.SKYVERN_API_KEY ?? "dev-skyvern-api-key";

const app = express();
app.use(express.json({ limit: "2mb" }));

function sign(body: string) {
  return {
    "content-type": "application/json",
    "x-skyvern-signature": generateSignature(body, API_KEY),
    "x-skyvern-timestamp": String(Math.floor(Date.now() / 1000)),
  };
}

async function sendWebhook(webhookUrl: string, payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  try {
    await fetch(webhookUrl, { method: "POST", headers: sign(body), body });
    console.log(`[mock-skyvern] webhook -> ${payload.status} for ${payload.run_id}`);
  } catch (err) {
    console.error("[mock-skyvern] webhook failed:", err);
  }
}

/** Polls our pull-based TOTP endpoint until a code is returned (or timeout). */
async function waitForTotp(totpUrl: string, runId: string, attempts = 30): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const body = JSON.stringify({ task_id: runId });
    const res = await fetch(totpUrl, { method: "POST", headers: sign(body), body });
    if (res.status === 200) {
      const data = (await res.json()) as { verification_code?: string };
      if (data.verification_code) return data.verification_code;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

function driveRun(runId: string, body: Record<string, any>) {
  const webhookUrl: string | undefined = body.webhook_url;
  const totpUrl: string | undefined = body.totp_url;
  const prompt: string = String(body.prompt ?? "");
  const needs2fa = Boolean(totpUrl) && /log\s?in|sign\s?in|2fa|portal/i.test(prompt);

  setTimeout(async () => {
    if (needs2fa && totpUrl) {
      console.log(`[mock-skyvern] ${runId} hit a 2FA wall; polling for a code...`);
      const code = await waitForTotp(totpUrl, runId);
      if (!code) {
        if (webhookUrl)
          await sendWebhook(webhookUrl, {
            run_id: runId,
            status: "failed",
            error_code: "NoTOTPVerificationCodeFound",
          });
        return;
      }
      console.log(`[mock-skyvern] ${runId} received 2FA code, finishing.`);
    }
    if (webhookUrl) {
      await sendWebhook(webhookUrl, {
        run_id: runId,
        status: "completed",
        summary: `Mock run finished: ${prompt.slice(0, 60)}`,
        output: { ok: true, prompt },
        recording_url: `https://mock.skyvern.local/recordings/${runId}.mp4`,
        app_url: `https://mock.skyvern.local/runs/${runId}`,
      });
    }
  }, 2000);
}

app.post("/v1/run/tasks", (req, res) => {
  const runId = `tsk_mock_${Math.random().toString(36).slice(2, 10)}`;
  driveRun(runId, req.body ?? {});
  res.json({ run_id: runId, status: "queued" });
});

app.post("/v1/run/tasks/login", (req, res) => {
  const runId = `tsk_mock_${Math.random().toString(36).slice(2, 10)}`;
  driveRun(runId, { ...(req.body ?? {}), prompt: "login portal" });
  res.json({ run_id: runId, status: "queued" });
});

app.post("/v1/run/workflows", (req, res) => {
  const runId = `wr_mock_${Math.random().toString(36).slice(2, 10)}`;
  driveRun(runId, req.body ?? {});
  res.json({ run_id: runId, status: "queued" });
});

app.post("/v1/credentials/totp", (_req, res) => res.json({ ok: true }));
app.get("/v1/runs/:id", (req, res) => res.json({ run_id: req.params.id, status: "running" }));

app.listen(PORT, () => {
  console.log(`[mock-skyvern] listening on http://localhost:${PORT}`);
});
