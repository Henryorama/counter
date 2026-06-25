import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Two organizations so we can prove tenant isolation.
  const acme = await prisma.organization.upsert({
    where: { slug: "acme-health" },
    update: {},
    create: { name: "Acme Health", slug: "acme-health", skyvernOrgId: "org_acme" },
  });

  const beta = await prisma.organization.upsert({
    where: { slug: "beta-clinic" },
    update: {},
    create: { name: "Beta Clinic", slug: "beta-clinic", skyvernOrgId: "org_beta" },
  });

  // A user who belongs to BOTH organizations (multi-tenant membership).
  const user = await prisma.user.upsert({
    where: { email: "operator@example.com" },
    update: {},
    create: { name: "Olivia Operator", email: "operator@example.com" },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: acme.id } },
    update: { role: "OWNER" },
    create: { userId: user.id, organizationId: acme.id, role: "OWNER" },
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: beta.id } },
    update: { role: "MEMBER" },
    create: { userId: user.id, organizationId: beta.id, role: "MEMBER" },
  });

  // A credential reference + a couple of demo jobs for the dashboard.
  const cred = await prisma.credential.create({
    data: {
      organizationId: acme.id,
      name: "Acme Payer Portal",
      type: "PASSWORD",
      skyvernCredentialId: "cred_demo_123",
      totpIdentifier: "billing@acme-health.example",
    },
  });

  await prisma.automationJob.create({
    data: {
      organizationId: acme.id,
      createdByUserId: user.id,
      credentialId: cred.id,
      runType: "TASK",
      status: "COMPLETED",
      prompt: "Download the latest remittance advice PDF from the payer portal.",
      skyvernRunId: "tsk_seed_completed_1",
      output: { files: 1, summary: "Downloaded remittance_2026_06.pdf" },
      startedAt: new Date(Date.now() - 1000 * 60 * 10),
      finishedAt: new Date(Date.now() - 1000 * 60 * 8),
    },
  });

  const actionJob = await prisma.automationJob.create({
    data: {
      organizationId: acme.id,
      createdByUserId: user.id,
      credentialId: cred.id,
      runType: "TASK",
      status: "ACTION_REQUIRED",
      prompt: "Log in to the payer portal and check claim status.",
      skyvernRunId: "tsk_seed_action_1",
      startedAt: new Date(Date.now() - 1000 * 60 * 2),
    },
  });

  await prisma.actionRequest.create({
    data: {
      jobId: actionJob.id,
      type: "TOTP_2FA",
      status: "WAITING",
      totpIdentifier: "billing@acme-health.example",
      context: { reason: "Portal requested a 2FA code sent via email." },
      expiresAt: new Date(Date.now() + 1000 * 60 * 15),
    },
  });

  await prisma.automationJob.create({
    data: {
      organizationId: beta.id,
      createdByUserId: user.id,
      runType: "TASK",
      status: "RUNNING",
      prompt: "Verify patient eligibility for member #44213.",
      skyvernRunId: "tsk_seed_running_1",
      startedAt: new Date(),
    },
  });

  console.log("Seed complete:", {
    organizations: [acme.slug, beta.slug],
    user: user.email,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
