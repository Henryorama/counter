# AGENTS.md

## Cursor Cloud specific instructions

### Repository layout
- The **active project** is a pnpm monorepo under `platform/` — a closed-source,
  multi-tenant healthcare automation SaaS that orchestrates a self-hosted
  **Skyvern** instance over its REST API only (AGPL-3.0 isolation = network
  boundary). See `platform/README.md`.
- The repo root also contains an unrelated **legacy 2018 React/Webpack
  boilerplate** (`src/`, `webpack.config.js`, root `package.json`). Ignore it
  unless explicitly asked; all new work lives in `platform/`.

### Services (run from `platform/`)
| Service | Command | Port | Notes |
| --- | --- | --- | --- |
| API (Express) | `pnpm -C platform/apps/api dev` | 4000 | webhook receiver + HITL/TOTP + jobs/orgs |
| Mock Skyvern (dev only) | `pnpm -C platform/apps/api mock:skyvern` | 8000 | simulates Skyvern so the full lifecycle works without a real instance |
| Web (Next.js) | `pnpm -C platform/apps/web dev` | 3000 | dashboard |

Standard scripts live in each `package.json` and `platform/README.md`; prefer those.

### Database (PostgreSQL — required, NOT installed by the update script)
Postgres is a system dependency. On a fresh pod it must be installed/started manually:
- Install (if missing): `sudo apt-get update && sudo apt-get install -y postgresql`
- Start: `sudo pg_ctlcluster 16 main start`
- Create role + DBs (role `app`/`app`, databases `skyvern_saas` + `skyvern_saas_shadow`):
  `sudo -u postgres psql -c "CREATE ROLE app LOGIN PASSWORD 'app' CREATEDB;" -c "CREATE DATABASE skyvern_saas OWNER app;" -c "CREATE DATABASE skyvern_saas_shadow OWNER app;"`
- Then: `pnpm -C platform db:migrate` and `pnpm -C platform db:seed`.

### Env files (gitignored — recreate locally)
- `platform/packages/db/.env` → `DATABASE_URL` + `SHADOW_DATABASE_URL`.
- `platform/apps/api/.env` and `platform/apps/web/.env.local` → copy from `platform/.env.example`.
- Defaults assume the local Postgres above (`postgresql://app:app@localhost:5432/...`).

### Dev auth (no real Auth.js yet)
- The API trusts `x-user-id` / `x-org-id` headers as a placeholder for an Auth.js
  session; the dashboard picks a seeded user via the dev-only `GET /v1/dev/users`.
- Seeded operator: `operator@example.com`, a member of **Acme Health** (OWNER)
  and **Beta Clinic** (MEMBER) — useful for demoing multi-tenant isolation.

### Non-obvious gotchas
- **Raw-body signature verification:** the `/v1/skyvern/webhook` and
  `/v1/skyvern/totp` routes verify Skyvern's HMAC-SHA256 over the *raw* request
  body and are mounted **before** `express.json()`. Never insert a global JSON
  parser ahead of them, or signatures will fail.
- **Mock Skyvern 2FA path:** the mock only simulates a 2FA wall when the prompt
  mentions login/sign-in/portal/2fa; other prompts complete directly.
- **AGPL boundary:** only `platform/apps/api/src/skyvern/*` may talk to Skyvern,
  and only over HTTP. Do not import Skyvern source anywhere.
- **Root `.gitignore` quirk:** the legacy root `.gitignore` ignores `*.sql` and
  all dotfiles; `platform/.gitignore` re-includes Prisma migration SQL and config
  dotfiles (`.eslintrc.json`, `.env.example`). Preserve those negations when
  adding new such files.
- `prisma generate` output is gitignored; run it (or `pnpm -C platform db:generate`)
  after pulling if `@platform/db` types look stale.
