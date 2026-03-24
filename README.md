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

### Run modes (dev vs production)

| Mode                          | What                                                                 | Commands                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dev (Docker, recommended)** | Hot reload, full stack (Postgres, Redis, migrate, backend, frontend) | `docker compose --profile hamina up --build -d` → UI [http://localhost:3000](http://localhost:3000) or `npm run docker:dev`                |
| **Production build (Docker)** | Compiled images (`hamina-build` profile)                             | `npm run docker:build` (same as `docker compose --profile hamina-build up --build -d`) → UI [http://localhost:3100](http://localhost:3100) |

### Development stack (hot reload, published UI)

Runs **db**, **redis**, **prisma-migrate** (on profile `hamina`), **backend** (dev image), **frontend** (dev image).

```bash
npm run docker:build
```

| Service                | URL / access                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js (UI + BFF)** | [http://localhost:3000](http://localhost:3000)                                                                                                           |
| **Postgres**           | `localhost:3762` (user/pass/db from `.env` or defaults in compose)                                                                                       |
| **Redis**              | **Not** published; backend uses **`REDIS_URL=redis://redis:6379`** on the Compose network (set in `docker-compose.yml` for `backend` / `backend-build`). |
| **Express**            | **Not** published on the host; Next BFF calls `http://backend:4000` inside the network (`BACKEND_INTERNAL_URL` on the frontend service).                 |

Stop: `docker compose --profile hamina down`

### Production-style build (compiled images)

Uses **`apps/backend/Dockerfile`** and **`apps/frontend/Dockerfile`**, plus db, redis, and migrate.

```bash
npm run docker:build
# equivalent:
docker compose --profile hamina-build up --build -d
```

| Service     | URL / access                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| **Next.js** | [http://localhost:3100](http://localhost:3100)                                                               |
| **Express** | Internal only (`backend-build:4000`); `frontend-build` has `BACKEND_INTERNAL_URL=http://backend-build:4000`. |

### Useful npm scripts (from repo root)

| Script                                  | Purpose                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run docker:build`                  | Production-style stack (`hamina-build` profile), detached                                                                                                                                                                                                                               |
| `npm run docker:dev`                    | `docker compose --profile db --profile backend --profile frontend up --build` (includes **Redis** because the `redis` service also uses the `backend` profile). Does **not** run **`prisma-migrate`**; use **`hamina`** or `npm run docker:migrate` if the DB schema is not up to date. |
| `npm run docker:migrate`                | One-shot Prisma migrate container (`prisma-migrate` profile)                                                                                                                                                                                                                            |
| `npm run docker:test:e2e`               | Build and run Playwright E2E **inside Docker** against the **`hamina`** stack (`PLAYWRIGHT_BASE_URL=http://frontend:3000`). See [End-to-end tests](#end-to-end-tests-playwright).                                                                                                       |
| `npm run dev --workspace apps/frontend` | Next dev **on host** (you must supply DB/Redis/backend yourself)                                                                                                                                                                                                                        |
| `npm run dev --workspace apps/backend`  | Express dev **on host** (same)                                                                                                                                                                                                                                                          |

### Advanced: DB + Redis only on Docker

If you run Next/Express with `npm run dev` on the host, start dependencies only:

```bash
docker compose --profile db --profile redis up -d
```

Then point **`DATABASE_URL`** / **`DIRECT_DATABASE_URL`** at `localhost:3762`, **`REDIS_URL`** at `redis://127.0.0.1:6379` (if Redis runs on the host) **or** temporarily map Redis in compose (e.g. `ports: ["6381:6379"]`) and use that URL, and **`BACKEND_INTERNAL_URL`** / **`NEXT_PUBLIC_*`** at `http://127.0.0.1:4000` in `apps/frontend/.env`, and run migrations against that DB (`npm run db:migrate --workspace @repo/db` with env loaded).

## Architecture

### End-to-end request path

You open pages such as:

- [`/sites`](<apps/frontend/src/app/(main)/sites/page.tsx>)
- [`/site/[siteId]`](<apps/frontend/src/app/(main)/site/[siteId]/page.tsx>)
- [`/site/[siteId]/devices/[deviceId]`](<apps/frontend/src/app/(main)/site/[siteId]/devices/[deviceId]/page.tsx>)

**BFF means Backend for Frontend.**  
In this project, the BFF is the Next.js server routes under [`apps/frontend/src/app/api/mist/`](apps/frontend/src/app/api/mist/).

Simple path:

- Browser calls `/api/mist/...` on Next.js.
- Next.js forwards to Express `/api/v1/mist/...`.
- Express calls Mist, Redis, and Postgres as needed.
- Response goes back through Next.js to the browser.

In Docker, set `BACKEND_INTERNAL_URL` (for example `http://backend:4000`) so Next.js can reach Express.

### Mist request lifecycle (cache, rate limit, BullMQ, SSE)

Short version:

- Express receives the request.
- Service code checks Redis cache first.
- If cache hit: return fast.
- If cache miss: call Mist API, normalize result, save to cache, return response.

Queue + SSE only apply on endpoints that return `isQueued`:

- API can return `{ isQueued, requestId, jobId }`.
- Browser listens on SSE (`/api/mist/events/{clientId}`).
- Worker sends progress (`queue-started`, `queue-complete`, `queue-error`).

Common reasons for errors:

- Next.js cannot reach Express (`BACKEND_INTERNAL_URL` wrong or backend not running).
- Mist API timeout or 429 rate limit.
- Redis unavailable.
- Queued request still in progress when UI expects immediate data.

### Mist data endpoints: Redis keys, TTL, and read flow

All TTLs are **seconds** in Redis (`SETEX`). Full key = **`{keyPrefix}:{cacheKey}`** from [`CACHE_CONFIGS`](apps/backend/src/lib/cache/redis-cache.ts). If Redis errors or is down, [`RedisCache`](apps/backend/src/lib/cache/redis-cache.ts) falls back to an in-process map for **`CACHE_FALLBACK_TTL_MINUTES`** (default 10 min).

**Endpoint reference** (Express path; BFF mirrors under `/api/mist/...` — see [API Endpoints](#api-endpoints)).

| BFF (browser)                              | Express `GET`                                  | Service function        | `getOrSet`                                                                                 | Redis `keyPrefix`                                | Cache key shape                                   | TTL                   |
| ------------------------------------------ | ---------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------- | --------------------- |
| `/api/mist/sites`                          | `/api/v1/mist/sites`                           | `getOrgSites`           | Direct                                                                                     | `mist:org:sites`                                 | `{orgId}:{page}:{limit}`                          | **300 s** (5 min)     |
| `/api/mist/sites/[siteId]/site-summary`    | `/api/v1/mist/sites/:siteId/site-summary`      | `getSiteSummary`        | One full Mist `/stats/devices?type=all` snapshot, then server-side counting by type/status | `mist:site:summary` + `mist:site:stats:snapshot` | `{siteId}`                                        | **180 s** / **300 s** |
| `/api/mist/sites/[siteId]/devices-catalog` | `/api/v1/mist/sites/:siteId/devices-catalog`   | `getSiteDevicesCatalog` | Same paginated **`/stats/devices?type=all`** walk as snapshot (no site `/devices` API)     | `mist:site:stats:snapshot`                       | `{siteId}`                                        | **300 s**             |
| `/api/mist/sites/[siteId]/devices`         | `/api/v1/mist/sites/:siteId/devices`           | `getDeviceList`         | Direct                                                                                     | `mist:site:stats:devices`                        | `{siteId}:t:{type}:s:{status}:p:{page}:l:{limit}` | **120 s**             |
| `/api/mist/sites/.../devices/[deviceId]`   | `/api/v1/mist/sites/:siteId/devices/:deviceId` | `getDeviceDetail`       | Stats snapshot lookup by id/MAC (no bulk org inventory fallback)                           | `mist:site:stats:snapshot`                       | `{siteId}`                                        | **300 s**             |
| `/api/mist/inventory`                      | `/api/v1/mist/inventory`                       | `getOrgInventory`       | Direct                                                                                     | `mist:inventory:org`                             | `{orgId}:{JSON.stringify(filters)}`               | **900 s** (15 min)    |
| `/api/mist/sites/[siteId]/client-stats`    | `/api/v1/mist/sites/:siteId/client-stats`      | `getSiteClientStats`    | Direct                                                                                     | `mist:clients:site`                              | `{siteId}:{JSON.stringify(options)}`              | **120 s** (2 min)     |

**Site device table (`getDeviceList`)** — Mist **`GET /api/v1/sites/{id}/stats/devices`** with `limit` / `page`, optional `status`, and `type` of `ap`, `switch`, or (when the UI sends no type) **`type=all`**. Omitting `type` on Mist often returns **AP-only** rows; `type=all` includes switches in practice. Each row is [`normalizeDevice`](apps/backend/src/services/mist.service.ts) (Mist’s `status` field is authoritative). Cached under **`mist:site:stats:devices`** (see table above).

**Full-site stats snapshot (`mist:site:stats:snapshot:{siteId}`)** — On cache miss, the backend walks Mist **`GET /api/v1/sites/{id}/stats/devices`** with **`type=all`**, **`limit`/`page`** until the list is complete, then [`normalizeDevice`](apps/backend/src/services/mist.service.ts). The same snapshot backs **`getDeviceDetail`** (lookup by id/MAC), **`getSiteDevicesCatalog`**, the live-stats stream **allowlist**, and **`getSiteSummary`** (server-side count aggregation).

**Not application-JSON cached** (no `getOrSet` on the response body):

| Express route                                         | Role                                                                                                                                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/mist/events/:clientId`                   | Long-lived **SSE** stream ([`sseManager.addClient`](apps/backend/src/lib/sse/sse-manager.ts)).                                                                                                  |
| `GET /api/v1/mist/sites/:siteId/devices-stats/stream` | **SSE** proxy of Mist **WebSocket** `/api-ws/v1/stream` subscribed to `/sites/{siteId}/stats/devices` ([`mist-device-stats-stream.ts`](apps/backend/src/lib/mist/mist-device-stats-stream.ts)). |
| `GET /api/v1/mist/queue/status`                       | Live **BullMQ** + SSE stats (reads queue state in Redis, not a Mist payload cache).                                                                                                             |

**Rate limit**

- We do not trust Mist to tell us remaining quota in headers.
- We track usage ourselves in Redis.
- We keep two counters:
  - minute counter
  - hour counter (resets at top of hour)
- We also limit concurrent calls in each backend process.
- Direct requests and queued worker requests both use the same Redis budget logic.

`mist:site:summary` caches the aggregated counts produced from the full-site stats snapshot inside `getSiteSummary`.

Queue flow in plain English:

- Request is accepted but marked as queued.
- Worker runs it later when rate-limit budget is available.
- Browser receives updates over SSE.

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

## Repository structure

- [`apps/frontend/`](apps/frontend/) — Next.js App Router, BFF routes, Mist UI ([`src/components/mist/`](apps/frontend/src/components/mist/), [`src/components/sites/`](apps/frontend/src/components/sites/)), queue client ([`src/lib/queue/`](apps/frontend/src/lib/queue/))
- [`apps/backend/`](apps/backend/) — Express entry [`server.ts`](apps/backend/server.ts), routes, Mist/cache/queue/SSE libraries
- [`packages/database/`](packages/database/) — Prisma, `@repo/db`
- [`packages/ts-shared/types/`](packages/ts-shared/types/) — `@repo/types`
- [`packages/ts-shared/ui/`](packages/ts-shared/ui/) — `@repo/ui`
- [`docker-compose.yml`](docker-compose.yml), [`scripts/`](scripts/), root [`package.json`](package.json) / [`turbo.json`](turbo.json)
- [`e2e/`](e2e/) — Playwright config and specs (see below)

## Features

### Mist API Integration

- **Organization sites** listing with pagination
- **Device inventory** with enhanced switch detection
- **Client statistics** for AP and wired clients — lists are built from Mist **`GET /api/v1/sites/{siteId}/stats/clients`** with both `wired=false` and `wired=true` (merged server-side; BFF: `/api/mist/sites/.../client-stats`). On the device detail page, **Connected Clients** filters those rows to the current AP; the **Clients** summary card uses **`num_clients`** from AP device stats, so the two can differ if Mist omits AP linkage on client rows or results are paginated (we request up to 1000 rows per site per wired mode when filtering by AP). Full flow, endpoints, and field mapping: [AP device detail: Connected Clients](#ap-device-detail-connected-clients).
- **Site summaries** with device counts and status
- **Real-time device monitoring** with connection status
- **How site table Status is determined** (`/stats/devices` list + `resolveRowStatus`) — see [Site device status: Connected, Disconnected, and Unknown](#site-device-status-connected-disconnected-and-unknown)

### Performance & Reliability

- **Rate limiting**: Every **`mistFetch`** waits for capacity under rolling **per-minute** (default 300, `MIST_MAX_REQUESTS_PER_MINUTE`) and **per-hour** (default 5000, `MIST_MAX_REQUESTS_PER_HOUR`) caps plus **10** concurrent requests; aligns with typical Mist org quotas.
- **Caching strategy**: Redis — **5 min** org sites (per page); **5 min** full-site **`/stats/devices`** snapshot per site (`mist:site:stats:snapshot`, detail/catalog/stream allowlist/summary aggregation); **2 min** paginated table queries (`mist:site:stats:devices`); **15 min** inventory; **2 min** client stats; **10 min** in-memory fallback when Redis is down
- **Queue system**: BullMQ with Redis backing for rate-limited requests
- **Progressive loading**: Site cards load basic info first, then enhance with site-summary device counts
- **Error handling**: Graceful degradation with partial data display

### User Experience

- **Card-based site overview** with location, device counts, and client information
- **Enhanced device tables** with serial numbers, last seen, client counts, connection status
- **Device detail views** with inventory details and connected client lists (for APs)
- **URL-driven pagination** that persists on page reload
- **Real-time feedback** for queued requests via SSE

## Environment variables

Templates live in:

| File                             | Purpose                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **`apps/frontend/.env.example`** | BFF URL, Mist keys, optional `NEXT_PUBLIC_BACKEND_URL`. **Copy to `apps/frontend/.env`.**                                                    |
| **`.env.example` (repo root)**   | Postgres, Redis, queue/cache/Bull Board defaults for Compose substitution. **Copy to `.env` at repo root** if you override compose defaults. |

### Where values are loaded

| Mechanism                            | What it does                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`env_file: ./apps/frontend/.env`** | In `docker-compose.yml`, both **`frontend`** and **`backend`** (and **`backend-build`**) load this file into the container process. **Put Mist secrets and shared app config here.**                                                                                                                  |
| **`environment:` in compose**        | Overrides per service, e.g. `NODE_ENV`, `PORT`, `DATABASE_URL` defaults, **`BACKEND_INTERNAL_URL=http://backend:4000`** (dev) or **`http://backend-build:4000`** (prod build), **`REDIS_URL=redis://redis:6379`** on **`backend`** / **`backend-build`** (internal Redis; not published to the host). |
| **Root `.env`**                      | Docker Compose reads **`.env`** next to `docker-compose.yml` for **`${VAR}`** interpolation (e.g. `${DATABASE_URL:-...}`, `${POSTGRES_USER:-postgres}` on the **`db`** service). Does **not** automatically inject into app containers unless the same name is passed via `environment` / `env_file`. |
| **`prisma-migrate` service**         | Gets `DATABASE_URL`, `DIRECT_DATABASE_URL`, `APP_SOURCE_NAME` from compose `environment` (can be fed from root `.env`).                                                                                                                                                                               |

### Variable reference (from code + compose)

| Variable                                              | Required               | Consumed by                                                   | Notes                                                                                                                                                        |
| ----------------------------------------------------- | ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MIST_API_KEY`                                        | **Yes** (runtime)      | Backend `getMistConfig()`                                     | Loaded from `apps/frontend/.env` in Docker.                                                                                                                  |
| `MIST_ORG_ID`                                         | **Yes**                | Backend                                                       | Same.                                                                                                                                                        |
| `MIST_API_BASE_URL`                                   | No                     | Backend                                                       | Default `https://api.mist.com`.                                                                                                                              |
| `MIST_WS_BASE_URL`                                    | No                     | Backend                                                       | Live-stats WebSocket host (default: REST `api.*` → `api-ws.*`, e.g. `wss://api-ws.mist.com`). See [`getMistWsBaseUrl`](apps/backend/src/lib/mist/config.ts). |
| `MIST_SITE_ID`                                        | No                     | Backend                                                       | Optional default site in dev.                                                                                                                                |
| `DATABASE_URL`                                        | Yes for DB/Prisma      | `@repo/db` / Prisma, compose defaults                         | In Docker, compose sets `postgresql://...@db:5432/...`.                                                                                                      |
| `DIRECT_DATABASE_URL`                                 | Yes for migrations     | Prisma / migrate service                                      | Often same as `DATABASE_URL`.                                                                                                                                |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | For Postgres container | **`db`** service `environment` in compose                     | Can be set via root `.env`.                                                                                                                                  |
| `REDIS_URL`                                           | No                     | Backend `redis-client.ts`                                     | Compose sets **`redis://redis:6379`** for **`backend`** / **`backend-build`** (internal). If unset locally, default is **`redis://127.0.0.1:6379`**.         |
| `REDIS_CLUSTER`                                       | No                     | Backend                                                       | Set `true` for cluster mode.                                                                                                                                 |
| `REDIS_PASSWORD`                                      | No                     | Documented in root `.env.example`                             | Wire into Redis URL if you secure Redis.                                                                                                                     |
| `CACHE_FALLBACK_TTL_MINUTES`                          | No                     | Backend `cache-config.ts`                                     | Default `10`.                                                                                                                                                |
| `REDIS_HEALTH_CHECK_INTERVAL_MS`                      | No                     | Backend                                                       | Default `30000`.                                                                                                                                             |
| `MIST_QUEUE_CONCURRENCY`                              | No                     | Backend BullMQ worker                                         | Default `5`.                                                                                                                                                 |
| `MIST_MAX_REQUESTS_PER_MINUTE`                        | No                     | Backend `mistFetch` throttle                                  | Default `300` (rolling 1 min).                                                                                                                               |
| `MIST_MAX_REQUESTS_PER_HOUR`                          | No                     | Backend `mistFetch` throttle                                  | Default `5000` (rolling 1 h; typical Mist org cap).                                                                                                          |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS`                 | No                     | Bull Board route                                              | Defaults `admin` / `changeme`.                                                                                                                               |
| `PORT`                                                | No                     | Backend `server.ts`                                           | Compose sets `4000` for backend services.                                                                                                                    |
| `NODE_ENV`                                            | No                     | Compose + Node                                                | `development` / `production` per service.                                                                                                                    |
| `BACKEND_INTERNAL_URL`                                | **Yes for BFF**        | Next.js **server** API routes (`getBackendInternalBaseUrl()`) | Compose sets Docker service URL; local dev use `http://127.0.0.1:4000`.                                                                                      |
| `NEXT_PUBLIC_BACKEND_URL`                             | No                     | Fallback in `getBackendInternalBaseUrl()` only                | Do **not** set to `http://backend:4000` (browser cannot resolve). See `apps/frontend/.env.example`.                                                          |
| `APP_SOURCE_NAME`                                     | No                     | `prisma-migrate` service                                      | Default `unknown`.                                                                                                                                           |

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

### End-to-end tests (Playwright)

Prerequisites:

- Full stack running with valid Mist credentials (e.g. `docker compose --profile hamina up --build -d`).
- [`apps/frontend/.env`](apps/frontend/.env.example) configured with **`MIST_API_KEY`** and **`MIST_ORG_ID`** (see [Environment variables](#environment-variables)).

One-time browser install for Playwright:

```bash
npx playwright install
```

**`PLAYWRIGHT_BASE_URL`** — Base URL for tests (default `http://localhost:3000`). Use `http://localhost:3100` when exercising the production-style Docker UI (`hamina-build`).

**`PLAYWRIGHT_E2E_SITE_ID`** — Optional. Device detail E2E uses a fixed default site to load the [site devices](<apps/frontend/src/app/(main)/site/[siteId]/page.tsx>) table, then opens the first device from `GET /api/mist/sites/{siteId}/devices`. Set this env var to use another site UUID in your org.

Run tests **on the host** (requires `npx playwright install` as above):

```bash
npm run test:e2e
```

Run tests **in Docker** with a single command (no local Chromium install):

```bash
npm run docker:test:e2e
```

That runs `docker compose --profile hamina --profile e2e build e2e` and then `docker compose --profile hamina --profile e2e run --rm e2e`. In order:

1. **Image** — [`e2e/Dockerfile`](e2e/Dockerfile) extends the official Playwright image, copies the repo, and runs **`npm ci`** so `@playwright/test` matches the lockfile.
2. **Compose** — The **`e2e`** service ([`docker-compose.yml`](docker-compose.yml)) joins the default network, depends on **`prisma-migrate`** (`service_completed_successfully`) and **`frontend`** (`service_started`), and sets **`PLAYWRIGHT_BASE_URL=http://frontend:3000`** so tests call the dev UI by Docker DNS (not `localhost`).
3. **Entrypoint** — [`e2e/docker-entrypoint.sh`](e2e/docker-entrypoint.sh) polls **`PLAYWRIGHT_BASE_URL`** until the app returns HTTP 200, then runs **`npm run test:e2e`**.
4. **Artifacts** — `playwright-report/` and `test-results/` on the host are bind-mounted from the container so you can open the HTML report after the run.

Optional: set **`PLAYWRIGHT_E2E_SITE_ID`** in your shell or root **`.env`** (Compose interpolation) to override the default site UUID used by the device-detail spec.

Keep the Playwright **image tag** in [`e2e/Dockerfile`](e2e/Dockerfile) aligned with the resolved **`@playwright/test`** version in `package-lock.json` (under `node_modules/@playwright/test`).

Site overview and site-devices specs resolve the **first org site** from the API at runtime. The **device detail** spec targets a **known default site** (overridable via **`PLAYWRIGHT_E2E_SITE_ID`**), loads that site’s device table in the browser, then picks the **first device** from the same devices endpoint and asserts the detail **`h1`**. If Mist returns no data or the API errors, affected specs **skip** with an explanatory message. After a run, open the [HTML report](https://playwright.dev/docs/test-reporters#html-reporter) via `npx playwright show-report` (artifacts under `playwright-report/`).

## API Endpoints

### Frontend (BFF Routes)

- `GET /api/mist/sites` - Organization sites with pagination
- `GET /api/mist/sites/[siteId]/site-summary` - Site device summary
- `GET /api/mist/sites/[siteId]/devices` - Site devices with filtering
- `GET /api/mist/sites/[siteId]/devices-catalog` - Full site list from the same **`/stats/devices`** snapshot as detail/stream (cached); not loaded by the default dashboard table
- `GET /api/mist/sites/[siteId]/devices-stats/stream` - SSE live device stats (Mist WebSocket, same-origin)
- `GET /api/mist/sites/[siteId]/devices/[deviceId]` - Device details
- `GET /api/mist/inventory` - Organization inventory with filtering
- `GET /api/mist/sites/[siteId]/client-stats` - Site client statistics

### Backend (Express Routes)

- `GET /api/v1/mist/sites` - Org sites (cached **5min** per org/page/limit)
- `GET /api/v1/mist/sites/:siteId/site-summary` - Site summary from one full **`/stats/devices?type=all`** snapshot with server-side counts (**`mist:site:summary`** / **`mist:site:stats:snapshot`**)
- `GET /api/v1/mist/sites/:siteId/devices` - Site device **table** page: Mist **`GET /sites/{id}/stats/devices`** with pagination and filters (**2 min** cache per site + filter + page + limit)
- `GET /api/v1/mist/sites/:siteId/devices-catalog` - Full site device summaries from the **stats snapshot** (**5 min** Redis, same key as detail lookup)
- `GET /api/v1/mist/sites/:siteId/devices-stats/stream` - SSE stream of live device stats (Mist WebSocket backend)
- `GET /api/v1/mist/sites/:siteId/devices/:deviceId` - Device detail from **stats snapshot** (lookup by id/MAC)
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

## Site device status: Connected, Disconnected, and Unknown

This section describes how the **Status** and **Connection** columns on `/site/[siteId]` are filled: **paginated** Mist **`/stats/devices`** rows (via our BFF), [`resolveRowStatus`](apps/frontend/src/components/mist/mist-devices-table.tsx) for the badge, and **row status** for offline/online when live stats are off — **no bulk org inventory** on the site table. **Site summary** and **device detail** use the same stats API (totals + cached full-site snapshot); **we do not use Mist `GET /sites/{id}/devices`**. **Live stats (SSE/WebSocket) does not set Status**; it only updates other columns when enabled (see [Future improvements](#future-improvements)).

### Pipeline: site device table (list)

| Step | Where                                                                                   | Input                                                                                           | Output                                                                                                                                                                                       |
| ---- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Mist API                                                                                | `GET /api/v1/sites/{siteId}/stats/devices` with `limit` / `page`, optional `status`, and `type` | Stats rows for the current page. When our API receives **no** `type` query, the backend sends **`type=all`** to Mist so **switches** are included (unfiltered Mist calls are often AP-only). |
| 2    | Backend [`getDeviceList`](apps/backend/src/services/mist.service.ts)                    | Mist JSON array                                                                                 | `normalizeDevice(row)` → `MistDeviceDetail` with `status: toDeviceStatus(raw)`.                                                                                                              |
| 3    | Express                                                                                 | `GET /api/v1/mist/sites/:siteId/devices`                                                        | JSON `{ data, meta }`; body cached under **`mist:site:stats:devices`** (per site + filters + page + limit).                                                                                  |
| 4    | Browser                                                                                 | Dashboard [`mist-dashboard.tsx`](apps/frontend/src/components/mist/mist-dashboard.tsx)          | Parallel **`site-summary`** + **`devices?page&limit&…`** (no **`devices-catalog`** for the table).                                                                                           |
| 5    | Frontend [`resolveRowStatus`](apps/frontend/src/components/mist/mist-devices-table.tsx) | Table row + `mergedById`                                                                        | **Status** / **Connection**: Mist **`raw.status`** and normalized `device.status` (no bulk org inventory on the table).                                                                      |

### Backend: full-site stats snapshot (detail, catalog, stream allowlist, summary aggregation)

[`getSiteStatsDevicesSnapshot`](apps/backend/src/services/mist.service.ts) paginates **`GET /api/v1/sites/{id}/stats/devices?type=all`** until all rows are read, then normalizes (no org-inventory bulk fetch). **Not** used for the paginated table (`getDeviceList` uses filtered **`/stats/devices`** with its own Redis keys).

`normalizeDevice` sets `status: toDeviceStatus(raw)` (see next table). There is **no** merge with site **`/devices`**.

### Backend: `toDeviceStatus` (Mist row → `connected` \| `disconnected` \| `unknown`)

Implemented in [`mist.service.ts`](apps/backend/src/services/mist.service.ts) (`toDeviceStatus`, `truthyConnection`). Examples of fields considered (not exhaustive):

| Kind               | Mist-style fields (booleans/strings normalized)                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`status` first** | Stats **`/stats/devices`** row: string **`status`** (e.g. `"connected"`, `"disconnected"`) is evaluated **before** booleans so it wins over fields like `wan_up`.                                                      |
| Booleans           | `connected`, `device_connected`, `deviceConnected`, `cloud_connected`, `lan_connected`, `l2tp_connected`, `wan_up`; `disabled === true` → disconnected.                                                                |
| Other string keys  | `connection_status`, `conn_status`, `device_status`, etc. (lowercased). **Order:** `disconnected` / `down` / `offline` before `connected` / `up` / `online` (substring **`"connected"`** inside **`"disconnected"`**). |

If nothing matches → **`unknown`**.

### Backend: site summary metric cards (`getSiteSummary`)

| Counter                 | Rule                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `byType.*.connected`    | Computed from normalized rows in one full **`/stats/devices?type=all`** snapshot (status = `connected`).            |
| `byType.*.disconnected` | Computed from normalized rows in the same snapshot (status != `connected`, including `disconnected` and `unknown`). |
| `totalDevices`          | Snapshot row count. Unknown type bucket is rows that are neither `ap` nor `switch`.                                 |

### Frontend: dashboard data sources

| Request                                                       | Purpose                           | Notes                                                                                                                                                         |
| ------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/mist/sites/{siteId}/devices?page&limit&type&status` | **Table rows + pagination**       | Backend → Mist **`/stats/devices`**; **`type=all`** when type omitted.                                                                                        |
| `GET /api/mist/sites/{siteId}/site-summary`                   | Metric cards                      | One full **`/stats/devices?type=all`** snapshot, then server-side type/status counting.                                                                       |
| `GET /api/mist/sites/{siteId}/devices-catalog`                | Optional full list (stats-backed) | Same Redis snapshot as detail; **not** loaded by the default dashboard table.                                                                                 |
| `GET /api/mist/inventory?…`                                   | Device detail / targeted lookups  | **Device detail** page uses **filtered** inventory (serial/model/MAC), not a site-wide bulk pull. Org sites cards use **`site-summary`**, not bulk inventory. |

### Frontend: `resolveRowStatus` (Status badge)

First match wins:

| Priority | Source                         | Condition                                         |
| -------- | ------------------------------ | ------------------------------------------------- |
| 1        | Mist **`raw.status`** string   | Parsed from stats row (`statusFromMistStatsRow`). |
| 2        | List API detail (`mergedById`) | `merged.status` is not `unknown`.                 |
| 3        | Table row (`device`)           | `device.status` is not `unknown`.                 |
| 4        | —                              | `unknown` (Unknown badge).                        |

**Connection** (when live stats off): **Online** / **Offline** from the same resolved row status (no inventory fetch).

### AP vs switch in practice

| Device type | Table list (`/stats/devices`)                               | Summary / detail                                                                               |
| ----------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **AP**      | Paginated stats rows; Mist **`status`** + `toDeviceStatus`. | Counts from full-site **stats snapshot** aggregation; detail row from **stats snapshot** only. |
| **Switch**  | Include with **`type=all`** (or `type=switch`); same as AP. | Same as AP; no site **`/devices`** merge.                                                      |

---

## AP device detail: Connected Clients

Example URL shape: `/site/{siteId}/devices/{deviceId}` (e.g. `http://localhost:3000/site/f339c0ca-e5c1-4e23-aed6-faf193307202/devices/00000000-0000-0000-1000-d420b080efbf`). Page component: `apps/frontend/src/app/(main)/site/[siteId]/devices/[deviceId]/mist-site-device-page.tsx`; detail UI: [`device-detail-view.tsx`](apps/frontend/src/components/mist/device-detail-view.tsx).

### Requests the browser makes (device page)

| Order        | Browser → BFF                                                                               | BFF → Express                                      | Backend → Mist                                                                   | Purpose                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1            | `GET /api/mist/sites/{siteId}/devices/{deviceId}`                                           | `GET /api/v1/mist/sites/:siteId/devices/:deviceId` | **Stats snapshot** Redis cache (lookup by id/MAC)                                | Load **`MistDeviceDetail`** (`device.raw`, type, name, stats fields such as `num_clients`).                      |
| 2 (AP only)  | `GET /api/mist/sites/{siteId}/client-stats?apId={device.id}&limit=100`                      | `GET /api/v1/mist/sites/:siteId/client-stats`      | **`GET /api/v1/sites/{siteId}/stats/clients`** with a raised `limit` (see below) | Build the **Connected Clients** list for this AP.                                                                |
| 3 (optional) | `GET /api/mist/inventory?siteId={siteId}&serial={serial}&model={model}&mac={mac}&limit=100` | `GET /api/v1/mist/inventory`                       | `GET /api/v1/orgs/{orgId}/inventory?site_id=…&serial=…&model=…&mac=…`            | **Inventory Details** block (serial, online/offline, profile, etc.). Uses targeted filters, not full-site fetch. |

Device detail uses a plain **`fetch`** for the device JSON; client-stats and inventory go through the **queue service** (`X-Client-ID` header) like other BFF routes.

### Backend: `getSiteClientStats` when `apId` is set

Implemented in [`getSiteClientStats`](apps/backend/src/services/mist.service.ts) (used by [`getSiteClientStatsController`](apps/backend/src/controllers/mist.controller.ts)).

| Setting                          | Value                                                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mist endpoint                    | Two calls to `GET /api/v1/sites/{siteId}/stats/clients`: one with `wired=false` and one with `wired=true` (each with `limit` and optional `duration`), merged server-side.                              |
| `limit` when filtering by AP     | `min(1000, max(300, (options.limit ?? 100) * 10))`. For UI `limit=100` → **1000** rows requested so clients tied to the AP are less likely to be cut off by pagination.                                 |
| Why not Mist `ap_id` query param | Comment in code: Mist’s `ap_id` query is **unreliable**; we fetch a wide site list and filter server-side.                                                                                              |
| Filter                           | Keep rows where `ap_id` on our normalized row (see below) equals **`options.apId`** (case-insensitive, trimmed).                                                                                        |
| Cap after filter                 | `slice(0, options.limit ?? 100)` → at most **100** clients returned to the UI for the Connected Clients list.                                                                                           |
| Cache                            | Redis key prefix **`mist:clients:site`** (per `siteId` + JSON-stringified options, merged result cached); TTL **120 s** — see [Mist data endpoints](#mist-data-endpoints-redis-keys-ttl-and-read-flow). |

### Mapping Mist client rows → `ClientStats` → UI

[`mapMistClientStatsRows`](apps/backend/src/services/mist.service.ts) maps each Mist object to [`ClientStats`](packages/ts-shared/types/src/mist/index.ts). **AP linkage** for filtering uses [`apIdFromMistClientRow`](apps/backend/src/services/mist.service.ts): first non-empty among Mist fields **`ap_id`**, **`ap`**, **`device_id`**.

| UI / API field            | Mist source fields (typical)                      |
| ------------------------- | ------------------------------------------------- |
| `mac`                     | `mac`                                             |
| `hostname`                | `hostname`                                        |
| `ip`                      | `ip`                                              |
| `ssid`                    | `ssid`                                            |
| `rssi`                    | `rssi` (shown as “−57 dBm” style in UI)           |
| `band`                    | `band` (e.g. `5` for 5 GHz)                       |
| `last_seen`               | `last_seen` (Unix seconds → formatted date in UI) |
| `is_guest`                | `is_guest`                                        |
| `ap_id` (for filter only) | `ap_id` **or** `ap` **or** `device_id`            |

In [`DeviceDetailView`](apps/frontend/src/components/mist/device-detail-view.tsx) **Connected Clients** renders up to **10** rows (`slice(0, 10)`) with hostname (fallback MAC), IP, SSID, guest badge, RSSI, band, and last seen — matching rows like _mursu3 / 10.2.2.78 / SSID: … / −57 dBm / 5 / date_.

### “Clients” summary card vs Connected Clients list

| UI block                                       | Data source                                                                           | Meaning                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Clients** (large number in the metric strip) | `device.raw.num_clients` from the **device** payload (AP stats on the detail object). | Mist’s count on that AP stats object.                           |
| **Connected Clients**                          | Filtered **`/stats/clients`** rows for this **`device.id`**.                          | Individual client rows; capped at 100 from API, first 10 shown. |

They can **differ**: Mist may report `num_clients` while client rows use another id field, pagination may omit rows, or stats and client list may be briefly inconsistent. The UI includes an **info** modal on the device page when `num_clients > 0` but the filtered list is empty — see [`DeviceDetailView`](apps/frontend/src/components/mist/device-detail-view.tsx).

### Switches and non-AP devices

**Connected Clients** (and the client-stats `useEffect`) run only when `device.type === 'ap'`. Switches do not load wireless client rows through this path.

---

## Future improvements

- **Mist live device stats (SSE + WebSocket)** — The site dashboard (`/site/[siteId]`) can enable **Stream live stats**, which opens same-origin SSE (`GET /api/mist/sites/.../devices-stats/stream` → Express → Mist WebSocket `wss://…/api-ws/v1/stream`, subscribe `/sites/{siteId}/stats/devices`). Implementation: hub [`mist-device-stats-stream.ts`](apps/backend/src/lib/mist/mist-device-stats-stream.ts), BFF proxy `apps/frontend/src/app/api/mist/sites/[siteId]/devices-stats/stream/route.ts`, hook [`use-mist-device-stats-stream.ts`](apps/frontend/src/hooks/use-mist-device-stats-stream.ts), live values overlaid in [`mist-devices-table.tsx`](apps/frontend/src/components/mist/mist-devices-table.tsx). **Good E2E checklist:** (1) open a site with APs, toggle live stats, confirm badge goes to “Live stats on” and AP rows update **Last seen / IP / Clients / Connection** when Mist pushes data; (2) stop live stats and confirm SSE closes and backend hub tears down the WS when the last subscriber leaves; (3) try a **regional** org — set `MIST_WS_BASE_URL` if REST is not `api.mist.com` (see [`getMistWsBaseUrl`](apps/backend/src/lib/mist/config.ts)). **Reliability work (connection sometimes fails):** add retries/backoff around initial WS connect, surface hub `stream_status` (`reconnecting` / `error`) in the UI with last error text, consider heartbeat/timeouts vs Mist’s behavior, and optionally add Playwright coverage that mocks upstream or asserts the stream toggle + degraded UI when the backend returns non-200 for the SSE route.

- **Site device table — Status** — Fully documented in [Site device status: Connected, Disconnected, and Unknown](#site-device-status-connected-disconnected-and-unknown) (`/stats/devices` list, enrichment, `resolveRowStatus`, summary vs table caches).

- **Load and rate-limit stress tests** — Add tooling (for example k6, Artillery, or distributed Playwright workers) to simulate **many concurrent users** hitting BFF and Express Mist routes, then observe **Redis cache hit rates**, **BullMQ depth**, **429 / queue enqueue behavior**, and **SSE fan-out** under the configured limits (see [`MistRateLimiter`](apps/backend/src/lib/mist/rate-limiter.ts)). Run against a non-production Mist org or mocked upstream so org API quotas stay safe.

- **3D site visualization (APs + switches)** — Render a navigable **3D / 2.5D** scene per site using indoor coordinates from Mist (`x_m`, `y_m`, `height`, `map_id`) plus device type/status from the **table list** or **`devices-catalog`**; link into the existing table and device detail flows. Full library comparison, architecture, and phased plan: [3D site visualization](#3d-site-visualization-aps-switches-floor-context).

### 3D site visualization (APs, switches, floor context)

**Goal:** Add an interactive **3D (or 2.5D) view** of a Mist **site** that shows **access points** and **switches** in spatial context, with **connection/status** cues, deep links to the existing device table and detail pages, and optional alignment to **floor maps** when Mist provides coordinates.

**What we already have (integration points):**

| Source                                                                                                                                                           | Use in 3D                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site device list (`GET /api/mist/sites/{siteId}/devices`, [`getDeviceList`](apps/backend/src/services/mist.service.ts)) + optional catalog (`…/devices-catalog`) | Device list, type (`ap` / `switch`), `id`, name, `status` (table uses **stats** endpoint; catalog adds placement / inventory-style fields if needed).                                                                               |
| Device raw fields `x_m`, `y_m`, `height`, `map_id`                                                                                                               | Indoor placement in meters (same as [`device-floor-placement.tsx`](apps/frontend/src/components/mist/device-floor-placement.tsx)); devices without coordinates need a **fallback layout** (grid, circle pack, or stacked by floor). |
| Site org metadata (`latlng` on sites)                                                                                                                            | Optional **geo backdrop** or orientation only; indoor `x_m`/`y_m` remain primary for campus maps.                                                                                                                                   |
| Live stats SSE (beta)                                                                                                                                            | Future: tint meshes or halos by **live** reachability / client load (see live stream hub).                                                                                                                                          |

**Recommended stack (frontend):**

| Option                                                          | Role                   | Pros                                                                                                                                                                                                | Cons                                                                                                                                          |
| --------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **React Three Fiber (R3F)** + **three** + **@react-three/drei** | Default choice         | Declarative React tree for scenes; `OrbitControls`, `PerspectiveCamera`, `Html` labels, `Instances` for many APs; huge ecosystem; fits Next.js App Router with dynamic `ssr: false` for the canvas. | WebGL only; bundle size; need resize + loading boundaries.                                                                                    |
| **Three.js** (imperative, no R3F)                               | Alternative            | Full control, no extra abstraction.                                                                                                                                                                 | More boilerplate; harder to keep in sync with React state.                                                                                    |
| **Babylon.js** (+ `@babylonjs/react` if used)                   | Alternative            | Strong tooling, exporters, XR later.                                                                                                                                                                | Heavier runtime; less common in this repo’s stack today.                                                                                      |
| **deck.gl**                                                     | Geo-centric sites only | Excellent **lat/lng** layers, large point clouds.                                                                                                                                                   | Weak fit for **indoor meter** (`x_m`/`y_m`) unless you build a custom coordinate system; better as a **second view** for outdoor-only assets. |

**Suggested architecture:**

1. **New UI surface** — e.g. route ` /site/[siteId]/floor-3d` or a **tab / split pane** on the existing site dashboard; load the **paginated stats-backed list** and/or **`devices-catalog`** depending on whether you need coordinates for every device in one shot.
2. **Scene graph** — One `Scene` per site view: **lights**, **floor plane** (grid or textured quad), **device group** with separate materials for AP vs switch (instanced meshes when device count is large).
3. **Coordinates** — Use `(x_m, y_m)` as horizontal plane; use `height` (or a default) for vertical offset. Group by `map_id` / floor if Mist returns multiple maps (multi-floor: separate layers or Z offset per floor index).
4. **Interaction** — Raycast on click → highlight device → `router.push` to `/site/.../devices/{id}` or sync selection with URL `?highlight=`. **Keyboard**: orbit / pan alternatives; **reduced motion**: offer 2D schematic fallback (extend current floor placement card).
5. **Textures / floor truth** — Phase 2+: investigate Mist **map / floor plan** APIs or exported images; apply as a **plane texture** under devices; calibrate scale so `x_m`/`y_m` align (may need map metadata from Mist docs).
6. **Status encoding** — Color or emissive intensity from list **`status`** (and later live stream); legend in UI matching **Connected / Disconnected / Unknown**.
7. **Performance** — `InstancedMesh` or drei `Instances` for 50–500 devices; `useFrame` only where needed; **dynamic import** of the canvas component to avoid SSR WebGL issues; observe **memory** on long sessions.
8. **Testing** — Visual regression (Playwright screenshots) optional; unit-test **coordinate normalization** and **fallback layout** pure functions in `@repo/ui` or `apps/frontend/src/lib/mist/`.

**Phased delivery:**

| Phase   | Scope                                                                                                                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MVP** | R3F scene: grid floor, spheres/boxes for AP (e.g. cone) vs switch (box), labels from `Html`, navigation to device detail; devices without `x_m`/`y_m` in a side panel list or auto-ring layout. |
| **V2**  | Floor image + calibration; multi-floor selector; table ↔ 3D selection sync.                                                                                                                     |
| **V3**  | Live SSE coloring; client density heat (if per-AP counts available without overloading Mist).                                                                                                   |

**Risks:** Mist coordinate coverage is **sparse** on some sites; map APIs and licensing; WebGL blocked on some corporate browsers — keep a **non-WebGL fallback** (current 2D schematic or table-only).

## License

MIT License - see LICENSE file for details.
