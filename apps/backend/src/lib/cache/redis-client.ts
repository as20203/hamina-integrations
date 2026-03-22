import { Redis, Cluster } from 'ioredis';

/** Local/backend-on-host default; Docker Compose sets REDIS_URL=redis://redis:6379 */
const defaultRedisUrl = "redis://127.0.0.1:6379";
const redisUrl = process.env.REDIS_URL ?? defaultRedisUrl;

const attachConnectionLogs = (connection: Redis | Cluster): Redis | Cluster => {
  connection.on('connect', () => {
    console.log(`[hamina-backend] redis socket connected to ${redisUrl}`);
  });

  connection.on('ready', () => {
    console.log('[hamina-backend] redis client ready');
  });

  connection.on('error', (error) => {
    console.error('[hamina-backend] redis connection error', error);
  });

  return connection;
};

const createConnection = (): Redis | Cluster => {
  const url = new URL(redisUrl);
  const useCluster = process.env.REDIS_CLUSTER === 'true';

  if (!useCluster) {
    return attachConnectionLogs(
      new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      })
    );
  }

  const isTls = url.protocol === 'rediss:';
  const port = url.port ? Number.parseInt(url.port, 10) : isTls ? 6380 : 6379;

  return attachConnectionLogs(
    new Cluster(
      [
        {
          host: url.hostname,
          port,
        },
      ],
      {
        redisOptions: {
          db:
            url.pathname && url.pathname !== '/'
              ? Number.parseInt(url.pathname.slice(1), 10)
              : undefined,
          maxRetriesPerRequest: null,
          password: url.password || undefined,
          username: url.username || undefined,
          ...(isTls ? { tls: {} } : {}),
        },
      }
    )
  );
};

export const redis = createConnection();