import { Router } from "express";
import { prisma } from "@platform/db";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const healthRouter = Router();

healthRouter.get(
  "/healthz",
  asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "up", time: new Date().toISOString() });
  }),
);
