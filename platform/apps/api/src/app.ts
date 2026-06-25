import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { ZodError } from "zod";
import { healthRouter } from "./routes/health.js";
import { organizationsRouter } from "./routes/organizations.js";
import { jobsRouter } from "./routes/jobs.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { totpRouter } from "./routes/totp.js";
import { devRouter } from "./routes/dev.js";
import { HttpSkyvernClient, type SkyvernClient } from "./skyvern/client.js";

/** Minimal permissive CORS for the local dashboard (dev convenience). */
const devCors: RequestHandler = (req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.header("origin") ?? "*");
  res.header("Access-Control-Allow-Headers", "content-type,x-user-id,x-org-id");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
};

export interface CreateAppOptions {
  /** Injectable so tests can stub Skyvern instead of hitting the network. */
  skyvern?: SkyvernClient;
}

export function createApp(opts: CreateAppOptions = {}) {
  const skyvern = opts.skyvern ?? new HttpSkyvernClient();
  const app = express();

  if (process.env.NODE_ENV !== "production") {
    app.use(devCors);
  }

  // IMPORTANT: webhook + totp routers use a RAW body parser internally for
  // signature verification, so they are mounted BEFORE the global JSON parser.
  app.use(webhooksRouter);
  app.use(totpRouter);

  // JSON parser for everything else.
  app.use(express.json({ limit: "1mb" }));

  app.use(healthRouter);
  app.use(organizationsRouter);
  app.use(jobsRouter(skyvern));
  if (process.env.NODE_ENV !== "production") {
    app.use(devRouter);
  }

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
