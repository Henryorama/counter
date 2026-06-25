# Skyvern-backed Healthcare Automation SaaS — Platform

Closed-source, multi-tenant SaaS that orchestrates a **self-hosted, unmodified Skyvern**
instance over its REST API only. This keeps our proprietary code isolated from Skyvern's
AGPL-3.0 source (network/IPC boundary = mere aggregation, not a combined work).

> Not legal advice — have IP counsel sign off on the AGPL boundary before launch.

## Layout

| Path | Purpose |
| --- | --- |
| `packages/shared` | Shared enums, types, and Zod validators (no runtime deps) |
| `packages/db` | Prisma schema, generated client, tenant-scoped client extension, seed |
| `apps/api` | Express API: health, webhook receiver (HMAC verify), HITL/TOTP, jobs/orgs |
| `apps/web` | Next.js dashboard (jobs, org switcher, human-in-the-loop panel) |

The project is built in testable layers: **database → API routes → frontend dashboard**.

## Quick start (local dev)

```bash
# 1. Postgres must be running and DATABASE_URL set (see .env.example)
cp .env.example .env
pnpm install

# 2. Database layer
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 3. Run services
pnpm dev:api   # http://localhost:4000
pnpm dev:web   # http://localhost:3000
```

## Testing

```bash
pnpm test        # unit/integration tests across packages
pnpm typecheck
pnpm lint
```

## Architecture notes

- **AGPL isolation:** only `apps/api/src/skyvern/*` may talk to Skyvern, and only via HTTP.
- **Multi-tenant:** users belong to many organizations via `Membership`; all tenant data is
  scoped by `organizationId` through the `forOrg()` client extension in `packages/db`.
- **Credentials:** third-party portal secrets are NOT stored here — only a
  `skyvernCredentialId` reference into Skyvern's vault.
- **HIPAA:** webhook payloads / recordings can contain PHI; they are access-controlled,
  retained per policy, and never written to application logs.
