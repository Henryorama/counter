import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { forOrg, prisma } from "./index.js";

/**
 * Integration test for the multi-tenant isolation seam. Requires DATABASE_URL
 * to point at a migrated Postgres database (see package README).
 */
describe("forOrg() tenant isolation", () => {
  const suffix = Math.random().toString(36).slice(2, 8);
  let orgAId = "";
  let orgBId = "";

  beforeAll(async () => {
    const orgA = await prisma.organization.create({
      data: { name: `Tenant A ${suffix}`, slug: `tenant-a-${suffix}` },
    });
    const orgB = await prisma.organization.create({
      data: { name: `Tenant B ${suffix}`, slug: `tenant-b-${suffix}` },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.$disconnect();
  });

  it("auto-injects organizationId on create", async () => {
    const dbA = forOrg(orgAId);
    const job = await dbA.automationJob.create({
      data: { prompt: "tenant A job", runType: "TASK" } as any,
    });
    expect(job.organizationId).toBe(orgAId);
  });

  it("scopes reads to the active organization", async () => {
    const dbA = forOrg(orgAId);
    const dbB = forOrg(orgBId);

    await dbA.automationJob.create({ data: { prompt: "A only", runType: "TASK" } as any });
    await dbB.automationJob.create({ data: { prompt: "B only", runType: "TASK" } as any });

    const aJobs = await dbA.automationJob.findMany();
    const bJobs = await dbB.automationJob.findMany();

    expect(aJobs.every((j) => j.organizationId === orgAId)).toBe(true);
    expect(bJobs.every((j) => j.organizationId === orgBId)).toBe(true);
    expect(aJobs.some((j) => j.prompt === "B only")).toBe(false);
  });

  it("prevents cross-tenant updates", async () => {
    const dbA = forOrg(orgAId);
    const dbB = forOrg(orgBId);

    const bJob = await dbB.automationJob.create({
      data: { prompt: "B private", runType: "TASK" } as any,
    });

    // Tenant A tries to update a tenant B job -> matches nothing.
    const result = await dbA.automationJob.updateMany({
      where: { id: bJob.id },
      data: { prompt: "hacked" },
    });
    expect(result.count).toBe(0);

    const reread = await dbB.automationJob.findUnique({ where: { id: bJob.id } });
    expect(reread?.prompt).toBe("B private");
  });
});
