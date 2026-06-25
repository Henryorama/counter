export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface DevUser {
  id: string;
  email: string;
  name: string | null;
  organizations: { id: string; name: string; role: string }[];
}

export interface ActionRequest {
  id: string;
  type: string;
  status: string;
  totpIdentifier: string | null;
}

export interface Job {
  id: string;
  status: string;
  runType: string;
  prompt: string | null;
  skyvernRunId: string | null;
  recordingUrl: string | null;
  createdAt: string;
  actionRequests: ActionRequest[];
}

function authHeaders(userId: string, orgId: string): HeadersInit {
  return { "content-type": "application/json", "x-user-id": userId, "x-org-id": orgId };
}

export async function fetchDevUsers(): Promise<DevUser[]> {
  const res = await fetch(`${API_URL}/v1/dev/users`, { cache: "no-store" });
  if (!res.ok) throw new Error(`dev/users failed: ${res.status}`);
  return (await res.json()).users;
}

export async function fetchJobs(userId: string, orgId: string): Promise<Job[]> {
  const res = await fetch(`${API_URL}/v1/jobs`, {
    headers: authHeaders(userId, orgId),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`jobs failed: ${res.status}`);
  return (await res.json()).jobs;
}

export async function createJob(
  userId: string,
  orgId: string,
  body: { prompt: string; url?: string },
): Promise<Job> {
  const res = await fetch(`${API_URL}/v1/jobs`, {
    method: "POST",
    headers: authHeaders(userId, orgId),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`create job failed: ${res.status}`);
  return (await res.json()).job;
}

export async function resolveAction(
  userId: string,
  orgId: string,
  jobId: string,
  actionId: string,
  verificationCode: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/v1/jobs/${jobId}/actions/${actionId}/resolve`, {
    method: "POST",
    headers: authHeaders(userId, orgId),
    body: JSON.stringify({ verificationCode }),
  });
  if (!res.ok) throw new Error(`resolve failed: ${res.status}`);
}
