import { PrismaClient, Prisma } from "@prisma/client";

export * from "@prisma/client";

/**
 * Singleton Prisma client. In dev we reuse the instance across hot reloads to
 * avoid exhausting database connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG ? ["query", "warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Tables that are owned by a tenant and must always be filtered by
 * `organizationId`. Used by `forOrg()` to enforce isolation.
 */
const TENANT_MODELS = new Set<string>([
  "Membership",
  "Credential",
  "WorkflowTemplate",
  "AutomationJob",
  "WebhookEvent",
  "AuditLog",
]);

/**
 * Returns a Prisma client that transparently scopes every read/write on
 * tenant-owned models to a single organization. This is the multi-tenant
 * isolation seam described in the architecture plan.
 *
 * Reads get an injected `where.organizationId`; creates get `data.organizationId`.
 */
export function forOrg(organizationId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) {
            return query(args);
          }

          const a = (args ?? {}) as Record<string, any>;

          // Scope filters for read/update/delete/count operations.
          if (
            operation === "findFirst" ||
            operation === "findFirstOrThrow" ||
            operation === "findMany" ||
            operation === "findUniqueOrThrow" ||
            operation === "findUnique" ||
            operation === "count" ||
            operation === "aggregate" ||
            operation === "updateMany" ||
            operation === "deleteMany" ||
            operation === "update" ||
            operation === "delete"
          ) {
            a.where = { ...(a.where ?? {}), organizationId };
          }

          // Inject tenant id on creates.
          if (operation === "create") {
            a.data = { ...(a.data ?? {}), organizationId };
          }
          if (operation === "createMany") {
            const data = a.data;
            a.data = Array.isArray(data)
              ? data.map((d: Record<string, unknown>) => ({ ...d, organizationId }))
              : { ...(data ?? {}), organizationId };
          }

          return query(a);
        },
      },
    },
  });
}

export type OrgScopedClient = ReturnType<typeof forOrg>;
export { Prisma };
