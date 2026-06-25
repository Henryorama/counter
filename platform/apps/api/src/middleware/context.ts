import type { NextFunction, Request, Response } from "express";
import { forOrg, prisma, type OrgScopedClient } from "@platform/db";

/**
 * Per-request tenant context.
 *
 * DEV NOTE: authentication here is a placeholder that trusts `x-user-id` and
 * `x-org-id` headers. In production this is replaced by an Auth.js session whose
 * "active organization" is validated against the user's memberships. The
 * membership check below (and the org-scoped `db`) is the real isolation seam
 * and stays identical once real auth is wired in.
 */
export interface RequestContext {
  userId: string;
  organizationId: string;
  role: string;
  db: OrgScopedClient;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ctx?: RequestContext;
    }
  }
}

export async function requireOrgContext(req: Request, res: Response, next: NextFunction) {
  const userId = req.header("x-user-id");
  const organizationId = req.header("x-org-id");

  if (!userId || !organizationId) {
    return res.status(401).json({ error: "Missing x-user-id / x-org-id (dev auth)" });
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });
  if (!membership) {
    return res.status(403).json({ error: "User is not a member of this organization" });
  }

  req.ctx = {
    userId,
    organizationId,
    role: membership.role,
    db: forOrg(organizationId),
  };
  next();
}
