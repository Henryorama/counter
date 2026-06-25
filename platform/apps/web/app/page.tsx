"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createJob,
  fetchDevUsers,
  fetchJobs,
  resolveAction,
  type DevUser,
  type Job,
} from "../lib/api";

export default function Dashboard() {
  const [users, setUsers] = useState<DevUser[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [orgId, setOrgId] = useState<string>("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string>("");

  const [prompt, setPrompt] = useState("Log in to the payer portal and download the latest remittance");
  const [url, setUrl] = useState("https://portal.example.com");
  const [creating, setCreating] = useState(false);

  const activeUser = useMemo(() => users.find((u) => u.id === userId), [users, userId]);

  // Load dev users once, default to the first user + their first org.
  useEffect(() => {
    fetchDevUsers()
      .then((u) => {
        setUsers(u);
        if (u[0]) {
          setUserId(u[0].id);
          setOrgId(u[0].organizations[0]?.id ?? "");
        }
      })
      .catch((e) => setError(String(e)));
  }, []);

  const refresh = useCallback(async () => {
    if (!userId || !orgId) return;
    try {
      setJobs(await fetchJobs(userId, orgId));
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, [userId, orgId]);

  // Poll for live status transitions (RUNNING -> ACTION_REQUIRED -> COMPLETED).
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [refresh]);

  async function onCreate() {
    setCreating(true);
    setError("");
    try {
      await createJob(userId, orgId, { prompt, url: url || undefined });
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="container">
      <div className="header">
        <div className="brand">
          <span className="dot" />
          <h1>Automation Console</h1>
        </div>
        <div className="controls">
          <select
            value={userId}
            onChange={(e) => {
              const u = users.find((x) => x.id === e.target.value);
              setUserId(e.target.value);
              setOrgId(u?.organizations[0]?.id ?? "");
            }}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </select>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {activeUser?.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.role})
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="panel error">{error}</div>}

      <div className="panel">
        <h2>New automation</h2>
        <div className="row">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What should the agent do?"
          />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Start URL (optional)" />
          <button onClick={onCreate} disabled={creating || !prompt || !orgId}>
            {creating ? "Dispatching…" : "Run automation"}
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Jobs</h2>
        {jobs.length === 0 && <div className="empty">No jobs yet for this organization.</div>}
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} userId={userId} orgId={orgId} onResolved={refresh} />
        ))}
      </div>
    </div>
  );
}

function JobRow({
  job,
  userId,
  orgId,
  onResolved,
}: {
  job: Job;
  userId: string;
  orgId: string;
  onResolved: () => void;
}) {
  const waiting = job.actionRequests.find((a) => a.status === "WAITING");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!waiting) return;
    setSubmitting(true);
    setErr("");
    try {
      await resolveAction(userId, orgId, job.id, waiting.id, code);
      setCode("");
      onResolved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="job">
      <div style={{ flex: 1 }}>
        <div>{job.prompt ?? "(no prompt)"}</div>
        <div className="meta">
          {job.runType} · {job.skyvernRunId ?? "no run id"}
          {job.recordingUrl ? " · recording available" : ""}
        </div>
        {waiting && (
          <div className="hitl">
            <div className="label">
              Action required — {waiting.type === "TOTP_2FA" ? "enter the 2FA code" : waiting.type}
            </div>
            <div className="row">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                style={{ maxWidth: 160 }}
              />
              <button onClick={submit} disabled={submitting || !code}>
                {submitting ? "Submitting…" : "Submit code"}
              </button>
            </div>
            {err && <div className="error">{err}</div>}
          </div>
        )}
      </div>
      <span className={`badge ${job.status}`}>{job.status.replace("_", " ")}</span>
    </div>
  );
}
