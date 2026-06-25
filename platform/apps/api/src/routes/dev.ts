import { Router } from "express";
import { prisma } from "@platform/db";
import { asyncHandler } from "../middleware/asyncHandler.js";

/**
 * Dev-only helpers to make the dashboard runnable without real Auth.js sessions.
 * Mounted only when NODE_ENV !== "production".
 */
export const devRouter = Router();

devRouter.get(
  "/v1/dev/users",
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      include: { memberships: { include: { organization: true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        organizations: u.memberships.map((m) => ({
          id: m.organization.id,
          name: m.organization.name,
          role: m.role,
        })),
      })),
    });
  }),
);
