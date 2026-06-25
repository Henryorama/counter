import { env } from "../env.js";

/**
 * The ONLY module permitted to talk to Skyvern, and only over HTTP. This keeps
 * our proprietary code isolated from Skyvern's AGPL-3.0 source (a network
 * boundary is "mere aggregation", not a combined/derivative work).
 *
 * Base URL points at our self-hosted instance, not Skyvern Cloud.
 */

export interface RunTaskInput {
  apiKey: string;
  prompt: string;
  url?: string;
  webhookUrl?: string;
  totpIdentifier?: string;
  totpUrl?: string;
  dataExtractionSchema?: Record<string, unknown>;
}

export interface RunWorkflowInput {
  apiKey: string;
  workflowId: string;
  parameters?: Record<string, unknown>;
  webhookUrl?: string;
}

export interface RunLoginInput {
  apiKey: string;
  credentialId: string;
  url: string;
  totpIdentifier?: string;
  totpUrl?: string;
  webhookUrl?: string;
}

export interface SkyvernRunResponse {
  run_id: string;
  status?: string;
  [key: string]: unknown;
}

export interface SkyvernClient {
  runTask(input: RunTaskInput): Promise<SkyvernRunResponse>;
  runWorkflow(input: RunWorkflowInput): Promise<SkyvernRunResponse>;
  runLogin(input: RunLoginInput): Promise<SkyvernRunResponse>;
  getRun(apiKey: string, runId: string): Promise<SkyvernRunResponse>;
  pushTotp(apiKey: string, body: Record<string, unknown>): Promise<unknown>;
}

type FetchLike = typeof fetch;

export class HttpSkyvernClient implements SkyvernClient {
  constructor(
    private readonly baseUrl: string = env.skyvern.baseUrl,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async post<T>(path: string, apiKey: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Skyvern POST ${path} failed: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  runTask(input: RunTaskInput): Promise<SkyvernRunResponse> {
    return this.post<SkyvernRunResponse>("/v1/run/tasks", input.apiKey, {
      prompt: input.prompt,
      url: input.url,
      webhook_url: input.webhookUrl,
      totp_identifier: input.totpIdentifier,
      totp_url: input.totpUrl,
      data_extraction_schema: input.dataExtractionSchema,
    });
  }

  runWorkflow(input: RunWorkflowInput): Promise<SkyvernRunResponse> {
    return this.post<SkyvernRunResponse>("/v1/run/workflows", input.apiKey, {
      workflow_id: input.workflowId,
      parameters: input.parameters,
      webhook_url: input.webhookUrl,
    });
  }

  runLogin(input: RunLoginInput): Promise<SkyvernRunResponse> {
    return this.post<SkyvernRunResponse>("/v1/run/tasks/login", input.apiKey, {
      credential_type: "skyvern",
      credential_id: input.credentialId,
      url: input.url,
      totp_identifier: input.totpIdentifier,
      totp_url: input.totpUrl,
      webhook_url: input.webhookUrl,
    });
  }

  async getRun(apiKey: string, runId: string): Promise<SkyvernRunResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/runs/${runId}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!res.ok) throw new Error(`Skyvern GET run failed: ${res.status}`);
    return (await res.json()) as SkyvernRunResponse;
  }

  pushTotp(apiKey: string, body: Record<string, unknown>): Promise<unknown> {
    return this.post("/v1/credentials/totp", apiKey, body);
  }
}
