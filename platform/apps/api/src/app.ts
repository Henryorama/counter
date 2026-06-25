import express, { type ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { healthRouter } from "./routes/health.js";
import { organizationsRouter } from "./routes/organizations.js";
import { jobsRouter } from "./routes/jobs.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { totpRouter } from "./routes/totp.js";
import { HttpSkyvernClient, type SkyvernClient } from "./skyvern/client.js";

export interface CreateAppOptions {
  /** Injectable so tests can stub Skyvern instead of hitting the network. */
  skyvern?: SkyvernClient;
}

export function createApp(opts: CreateAppOptions = {}) {
  const skyvern = opts.skyvern ?? new HttpSkyvernClient();
  const app = express();

  // IMPORTANT: webhook + totp routers use a RAW body parser internally for
  // signature verification, so they are mounted BEFORE the global JSON parser.
  app.use(webhooksRouter);
  app.use(totpRouter);

  // JSON parser for everything else.
  app.use(express.json({ limit: "1mb" }));

  app.use(healthRouter);
  app.use(organizationsRouter);
  app.use(jobsRouter(skyvern));

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "ValidationError", details: err.flatten() });
    }
    // eslint-disable-next-line no-console
    console.error("[api] unhandled error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "InternalServerError" });
  };
  app.use(errorHandler);

  return app;
}
