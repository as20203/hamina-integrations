# Hamina Integrations

A comprehensive network management platform built with Next.js and Express.js, featuring Juniper Mist API integration with advanced rate limiting, caching, and real-time updates.

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

## Environment Configuration

### Required Variables
```bash
# Mist API Configuration
MIST_API_KEY=your_mist_api_key
MIST_ORG_ID=your_organization_id
MIST_SITE_ID=optional_fallback_site_id  # Optional fallback

# Redis Configuration
REDIS_URL=redis://hamina-redis:6379
REDIS_CLUSTER=false
CACHE_FALLBACK_TTL_MINUTES=10

# Queue Configuration
MIST_QUEUE_CONCURRENCY=5
REDIS_HEALTH_CHECK_INTERVAL_MS=30000

# Bull Board Authentication
BASIC_AUTH_USER=admin
BASIC_AUTH_PASS=changeme

# Database
DATABASE_URL=postgresql://postgres:postgres@db:5432/postgres
DIRECT_DATABASE_URL=postgresql://postgres:postgres@db:5432/postgres
```

## Development

### Prerequisites
- Node.js 18+ with npm
- Docker and Docker Compose
- Mist API credentials

### Quick Start
```bash
# Clone and install dependencies
git clone <repository>
cd hamina-integrations
npm install

# Start development environment
docker compose --profile hamina up --build -d

# Access services
# Frontend: http://localhost:3000
# Backend: http://localhost:4000
# Bull Board: http://localhost:4000/admin/queues (admin/changeme)
# Redis: localhost:6381
```

### Development Commands
```bash
# Frontend development
npm run dev --workspace apps/frontend

# Backend development  
npm run dev --workspace apps/backend

# Type checking
npm run check-types --workspace apps/frontend
npm run check-types --workspace apps/backend

# Linting
npm run lint --workspace apps/frontend
```

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

### Production Build
```bash
# Build all services
docker compose --profile hamina --profile backend-build --profile frontend-build up --build -d

# Access production services
# Frontend: http://localhost:3100
# Backend: http://localhost:4100
```

### Docker Services
- **hamina-redis**: Redis 8.4 Alpine with persistence
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