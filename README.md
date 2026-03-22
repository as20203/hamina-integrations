# Hamina Integrations Monorepo

Simple monorepo scaffold inspired by the structure in `test-folder/power-apply-clarvo-dev`.

```
build with no cache
docker compose --profile db --profile backend --profile frontend build --no-cache docker compose --profile db --profile backend --profile frontend up
```

## Structure

```txt
.
├── apps
│   ├── frontend        # Next.js — Mist site UI (`/mist`, `@/components/mist`, BFF under `app/api/mist`)
│   └── backend         # Express — `/health`, `/api/v1/mist/*`
├── packages
│   ├── database        # Prisma (@repo/db)
│   └── ts-shared/ui    # shadcn `@repo/ui` + `shared/modal`, `shared/pagination`
├── docker-compose.yml
└── package.json
```

## Apps

- `frontend`: Next.js + TypeScript app on port `3000`
- `backend`: Node.js + TypeScript app on port `4000`
- `@repo/db`: shared Prisma package structure under `packages/database`

## Local development

From repo root:

```bash
npm install
npm run db:generate
npm run dev:backend
npm run dev:frontend
```

Then open:

- Frontend: [http://localhost:3000](http://localhost:3000) (redirects to `/mist`)
- Backend: [http://localhost:4000](http://localhost:4000) (`/health` only; no demo JSON routes)

## Docker

Build and run apps + database + prisma migration:

```bash
docker compose up --build
```

Key services:

- `db`: Postgres (pgvector image) exposed on `3762`
- `prisma-migrate`: waits for DB, then runs `npx prisma migrate dev` from `packages/database`
- `backend`: waits for DB + migration service before starting
- `frontend`: depends on backend

Run migrations manually (reference workflow):

```bash
docker compose run --rm prisma-migrate
```

Recommended scripted workflows:

```bash
# Run migrations once
npm run docker:migrate

# Development containers (frontend + backend + db)
npm run docker:dev

# Production-like build containers (frontend-build + backend-build + db + migrations)
npm run docker:build
```

Environment variables:

- **Repo root** `.env` (copy from `.env.example`): shared values used by Docker Compose and all apps — database URLs, Postgres credentials.
- **`apps/frontend/.env`** (copy from `apps/frontend/.env.example`): frontend app + **Mist** settings (`MIST_*`). The backend reads the same file when you run it locally so Mist calls keep working; do **not** prefix secrets with `NEXT_PUBLIC_`.

```bash
# .env (repo root)
DATABASE_URL=postgresql://postgres:postgres@db:5432/postgres
DIRECT_DATABASE_URL=postgresql://postgres:postgres@db:5432/postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=postgres
```

```bash
# apps/frontend/.env — see apps/frontend/.env.example
MIST_API_KEY=
MIST_API_BASE_URL=https://api.mist.com
MIST_ORG_ID=
MIST_SITE_ID=
```

Services:

- Frontend (dev): [http://localhost:3000](http://localhost:3000)
- Backend (dev): [http://localhost:4000](http://localhost:4000)
- Frontend (build): [http://localhost:3100](http://localhost:3100)
- Backend (build): [http://localhost:4100](http://localhost:4100)

## Notes

- Monorepo uses npm workspaces with `apps/*` and `packages/*`.
- Shared Prisma package lives in `packages/database` and can be expanded later for actual DB usage.
