# Hamina Integrations

A comprehensive network management platform built with Next.js and Express.js, featuring Juniper Mist API integration with advanced rate limiting, caching, and real-time updates.

## Docker is required

Postgres, Redis, the Express API, and Next.js are orchestrated with **Docker Compose**. You need **Docker** and **Docker Compose** installed to run the app the way this repo expects (databases, queues, and internal networking). You can still run `npm install` on your host for editors and scripts, but **starting the full stack uses Compose**.

## How to start the app

### One-time setup

```bash
git clone <repository>
cd hamina-integrations
npm install
```

1. **Mist / BFF env (required)**  
   Copy `apps/frontend/.env.example` → **`apps/frontend/.env`** and set at least **`MIST_API_KEY`** and **`MIST_ORG_ID`** (see [Environment variables](#environment-variables) below).

2. **Compose substitution (optional)**  
   Copy **`.env.example`** → **`.env`** in the **repo root** if you want to override defaults for Compose (Postgres credentials, `DATABASE_URL`, Redis URL, etc.). Compose injects these when expanding `${VAR}` in `docker-compose.yml`.

### Development stack (hot reload, published UI)

Runs **db**, **redis**, **prisma-migrate** (on profile `hamina`), **backend** (dev image), **frontend** (dev image).

```bash
docker compose --profile hamina up --build -d
```

| Service    | URL / access |
|-----------|----------------|
| **Next.js (UI + BFF)** | [http://localhost:3000](http://localhost:3000) |
| **Postgres** | `localhost:3762` (user/pass/db from `.env` or defaults in compose) |
| **Redis**    | **Not** published; backend uses **`REDIS_URL=redis://redis:6379`** on the Compose network (set in `docker-compose.yml` for `backend` / `backend-build`). |
| **Express**  | **Not** published on the host; Next BFF calls `http://backend:4000` inside the network (`BACKEND_INTERNAL_URL` on the frontend service). |

Stop: `docker compose --profile hamina down`

### Production-style build (compiled images)

Uses **`apps/backend/Dockerfile`** and **`apps/frontend/Dockerfile`**, plus db, redis, and migrate.

```bash
npm run docker:build
# equivalent:
docker compose --profile hamina-build up --build -d
```

| Service    | URL / access |
|-----------|----------------|
| **Next.js** | [http://localhost:3100](http://localhost:3100) |
| **Express** | Internal only (`backend-build:4000`); `frontend-build` has `BACKEND_INTERNAL_URL=http://backend-build:4000`. |

### Useful npm scripts (from repo root)

| Script | Purpose |
|--------|---------|
| `npm run docker:build` | Production-style stack (`hamina-build` profile), detached |
| `npm run docker:dev` | `docker compose --profile db --profile backend --profile frontend up --build` (includes **Redis** because the `redis` service also uses the `backend` profile). Does **not** run **`prisma-migrate`**; use **`hamina`** or `npm run docker:migrate` if the DB schema is not up to date. |
| `npm run docker:migrate` | One-shot Prisma migrate container (`prisma-migrate` profile) |
| `npm run dev --workspace apps/frontend` | Next dev **on host** (you must supply DB/Redis/backend yourself) |
| `npm run dev --workspace apps/backend` | Express dev **on host** (same) |

### Advanced: DB + Redis only on Docker

If you run Next/Express with `npm run dev` on the host, start dependencies only:

```bash
docker compose --profile db --profile redis up -d
```

Then point **`DATABASE_URL`** / **`DIRECT_DATABASE_URL`** at `localhost:3762`, **`REDIS_URL`** at `redis://127.0.0.1:6379` (if Redis runs on the host) **or** temporarily map Redis in compose (e.g. `ports: ["6381:6379"]`) and use that URL, and **`BACKEND_INTERNAL_URL`** / **`NEXT_PUBLIC_*`** at `http://127.0.0.1:4000` in `apps/frontend/.env`, and run migrations against that DB (`npm run db:migrate --workspace @repo/db` with env loaded).

## Architecture

### Frontend (Next.js App Router)
- **Multi-site dashboard** at `/sites` with card-based layout and URL-driven pagination
- **Per-site views** at `/site/[siteId]` with device management and monitoring
- **Device detail pages** at `/site/[siteId]/devices/[deviceId]` with inventory and client information
- **Progressive loading** with queue service for rate-limited API calls
- **Real-time updates** via Server-Sent Events (SSE)

### Backend (Express.js)
- **3-layer architecture**: Routes → Controllers → Services
- **Rate limiting** with BullMQ queue system and exponential backoff
- **Redis caching** with in-memory fallback when Redis is unavailable
- **Enhanced device detection** using multiple Mist API endpoints
- **Bull Board dashboard** for queue monitoring with basic authentication

## Features

### Mist API Integration
- **Organization sites** listing with pagination
- **Device inventory** with enhanced switch detection
- **Client statistics** for wireless access points
- **Site summaries** with device counts and status
- **Real-time device monitoring** with connection status

### Performance & Reliability
- **Rate limiting**: 300 requests/minute with 10 concurrent requests max
- **Caching strategy**: Redis (15min inventory, 2min clients, 30sec summaries) + 10min in-memory fallback
- **Queue system**: BullMQ with Redis backing for rate-limited requests
- **Progressive loading**: Site cards load basic info first, then enhance with inventory/client data
- **Error handling**: Graceful degradation with partial data display

### User Experience
- **Card-based site overview** with location, device counts, and client information
- **Enhanced device tables** with serial numbers, last seen, client counts, connection status
- **Device detail views** with inventory details and connected client lists (for APs)
- **URL-driven pagination** that persists on page reload
- **Real-time feedback** for queued requests via SSE

## Environment variables

Templates live in:

| File | Purpose |
|------|---------|
| **`apps/frontend/.env.example`** | BFF URL, Mist keys, optional `NEXT_PUBLIC_BACKEND_URL`. **Copy to `apps/frontend/.env`.** |
| **`.env.example` (repo root)** | Postgres, Redis, queue/cache/Bull Board defaults for Compose substitution. **Copy to `.env` at repo root** if you override compose defaults. |

### Where values are loaded

| Mechanism | What it does |
|-----------|----------------|
| **`env_file: ./apps/frontend/.env`** | In `docker-compose.yml`, both **`frontend`** and **`backend`** (and **`backend-build`**) load this file into the container process. **Put Mist secrets and shared app config here.** |
| **`environment:` in compose** | Overrides per service, e.g. `NODE_ENV`, `PORT`, `DATABASE_URL` defaults, **`BACKEND_INTERNAL_URL=http://backend:4000`** (dev) or **`http://backend-build:4000`** (prod build), **`REDIS_URL=redis://redis:6379`** on **`backend`** / **`backend-build`** (internal Redis; not published to the host). |
| **Root `.env`** | Docker Compose reads **`.env`** next to `docker-compose.yml` for **`${VAR}`** interpolation (e.g. `${DATABASE_URL:-...}`, `${POSTGRES_USER:-postgres}` on the **`db`** service). Does **not** automatically inject into app containers unless the same name is passed via `environment` / `env_file`. |
| **`prisma-migrate` service** | Gets `DATABASE_URL`, `DIRECT_DATABASE_URL`, `APP_SOURCE_NAME` from compose `environment` (can be fed from root `.env`). |

### Variable reference (from code + compose)

| Variable | Required | Consumed by | Notes |
|----------|----------|-------------|--------|
| `MIST_API_KEY` | **Yes** (runtime) | Backend `getMistConfig()` | Loaded from `apps/frontend/.env` in Docker. |
| `MIST_ORG_ID` | **Yes** | Backend | Same. |
| `MIST_API_BASE_URL` | No | Backend | Default `https://api.mist.com`. |
| `MIST_SITE_ID` | No | Backend | Optional default site in dev. |
| `DATABASE_URL` | Yes for DB/Prisma | `@repo/db` / Prisma, compose defaults | In Docker, compose sets `postgresql://...@db:5432/...`. |
| `DIRECT_DATABASE_URL` | Yes for migrations | Prisma / migrate service | Often same as `DATABASE_URL`. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | For Postgres container | **`db`** service `environment` in compose | Can be set via root `.env`. |
| `REDIS_URL` | No | Backend `redis-client.ts` | Compose sets **`redis://redis:6379`** for **`backend`** / **`backend-build`** (internal). If unset locally, default is **`redis://127.0.0.1:6379`**. |
| `REDIS_CLUSTER` | No | Backend | Set `true` for cluster mode. |
| `REDIS_PASSWORD` | No | Documented in root `.env.example` | Wire into Redis URL if you secure Redis. |
| `CACHE_FALLBACK_TTL_MINUTES` | No | Backend `cache-config.ts` | Default `10`. |
| `REDIS_HEALTH_CHECK_INTERVAL_MS` | No | Backend | Default `30000`. |
| `MIST_QUEUE_CONCURRENCY` | No | Backend BullMQ worker | Default `5`. |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | No | Bull Board route | Defaults `admin` / `changeme`. |
| `PORT` | No | Backend `server.ts` | Compose sets `4000` for backend services. |
| `NODE_ENV` | No | Compose + Node | `development` / `production` per service. |
| `BACKEND_INTERNAL_URL` | **Yes for BFF** | Next.js **server** API routes (`getBackendInternalBaseUrl()`) | Compose sets Docker service URL; local dev use `http://127.0.0.1:4000`. |
| `NEXT_PUBLIC_BACKEND_URL` | No | Fallback in `getBackendInternalBaseUrl()` only | Do **not** set to `http://backend:4000` (browser cannot resolve). See `apps/frontend/.env.example`. |
| `APP_SOURCE_NAME` | No | `prisma-migrate` service | Default `unknown`. |

## Development

### Prerequisites
- **Docker** and **Docker Compose** (required to run the stack)
- **Node.js 18+** and **npm** (for local install, types, lint)
- **Mist API** credentials in `apps/frontend/.env`

### Commands (host)

```bash
# Type checking
npm run check-types --workspace apps/frontend
npm run check-types --workspace apps/backend

# Linting
npm run lint --workspace apps/frontend
npm run lint --workspace apps/backend
```

### Docker build: `npm` ECONNRESET / network aborted

Image builds use **BuildKit** with an **npm cache mount**, longer **fetch timeouts**, more **per-request retries**, and **two full `npm install` retries** with backoff. If installs still fail:

1. **Retry** the same `docker compose build` (often transient registry/Wi‑Fi drops).
2. **Stable network** — try wired, VPN off, or another connection.
3. **Linux: build with host networking** (can help with Docker DNS/NAT):
   ```bash
   DOCKER_BUILDKIT=1 docker build --network=host -f apps/backend/Dockerfile .
   ```
4. **Corporate proxy** — set `HTTP_PROXY` / `HTTPS_PROXY` for the daemon or build, and npm `proxy` / `https-proxy` if required.

## API Endpoints

### Frontend (BFF Routes)
- `GET /api/mist/sites` - Organization sites with pagination
- `GET /api/mist/sites/[siteId]/site-summary` - Site device summary
- `GET /api/mist/sites/[siteId]/devices` - Site devices with filtering
- `GET /api/mist/sites/[siteId]/devices/[deviceId]` - Device details
- `GET /api/mist/inventory` - Organization inventory with filtering
- `GET /api/mist/sites/[siteId]/client-stats` - Site client statistics

### Backend (Express Routes)
- `GET /api/v1/mist/sites` - Org sites (cached 15min)
- `GET /api/v1/mist/sites/:siteId/site-summary` - Site summary (cached 3min)
- `GET /api/v1/mist/sites/:siteId/devices` - Site devices (cached 5min)
- `GET /api/v1/mist/sites/:siteId/devices/:deviceId` - Device detail (cached 5min)
- `GET /api/v1/mist/inventory` - Org inventory (cached 15min)
- `GET /api/v1/mist/sites/:siteId/client-stats` - Client stats (cached 2min)
- `GET /api/v1/mist/events/:clientId` - SSE endpoint for real-time updates
- `GET /api/v1/mist/queue/status` - Queue and SSE statistics

### Monitoring
- `GET /admin/queues` - Bull Board dashboard (basic auth required)
- `GET /health` - Backend health check

## Deployment

### Production Build (`hamina-build` profile)

Uses **`apps/backend/Dockerfile`** and **`apps/frontend/Dockerfile`**, plus Postgres, Redis, and a one-shot Prisma migrate.

```bash
npm run docker:build
# same as:
docker compose --profile hamina-build up --build -d

# Or only backend/frontend images (you must start db, redis, migrate separately):
docker compose --profile backend-build --profile frontend-build up --build -d
```

**Access:** Next.js **http://localhost:3100** (Mist API via BFF). Express is **not** published on the host; it runs as `backend-build` on the Compose network (`BACKEND_INTERNAL_URL` on `frontend-build`).

### Docker Services
- **hamina-redis**: Redis 8.4 Alpine with persistence (internal port 6379 only unless you add a `ports` mapping for debugging)
- **hamina-backend**: Express.js API server
- **hamina-frontend**: Next.js web application
- **hamina-shared-db**: PostgreSQL database

## Monitoring & Debugging

### Bull Board Dashboard
Access queue monitoring at `/admin/queues` with basic authentication:
- View active, waiting, completed, and failed jobs
- Monitor job processing times and retry attempts
- Debug rate limiting and queue performance

### Queue Statistics
Monitor queue health via `/api/v1/mist/queue/status`:
```json
{
  "ok": true,
  "data": {
    "queue": {
      "waiting": 0,
      "active": 2,
      "completed": 150,
      "failed": 1
    },
    "sse": {
      "connectedClients": 3,
      "clients": ["client-uuid-1", "client-uuid-2"]
    }
  }
}
```

### Cache Performance
Redis cache with intelligent fallback:
- **Primary**: Redis with configurable TTL per data type
- **Fallback**: In-memory cache (10min TTL) when Redis unavailable
- **Health checks**: Automatic Redis connectivity monitoring
- **Pattern invalidation**: Selective cache clearing by key patterns

## Technology Stack

### Frontend
- **Next.js 16** with App Router and React 19
- **TypeScript** for type safety
- **Tailwind CSS** with shadcn/ui components
- **Lucide React** for icons
- **Server-Sent Events** for real-time updates

### Backend  
- **Express.js** with TypeScript
- **BullMQ** for job queuing with Redis
- **ioredis** for Redis connectivity
- **Bull Board** for queue monitoring
- **Prisma** for database ORM

### Infrastructure
- **Docker Compose** for service orchestration
- **Redis 8.4** for caching and job queues
- **PostgreSQL** for application data
- **Nginx** (optional) for production reverse proxy

## License

MIT License - see LICENSE file for details.