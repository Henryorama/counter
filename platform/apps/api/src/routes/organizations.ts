import { Router } from "express";
import { prisma } from "@platform/db";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const organizationsRouter = Router();

/** Lists organizations the authenticated user belongs to (for the org switcher). */
organizationsRouter.get(
  "/v1/organizations",
  asyncHandler(async (req, res) => {
    const userId = req.header("x-user-id");
    if (!userId) return res.status(401).json({ error: "Missing x-user-id (dev auth)" });

    const memberships = await prisma.membership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      organizations: memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
    });
  }),
);
