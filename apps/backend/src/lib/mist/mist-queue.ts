import { Queue, Worker, Job, type ConnectionOptions } from "bullmq";
import { redis } from "../cache/redis-client.js";
import { sseManager } from "../sse/sse-manager.js";
import { v4 as uuidv4 } from "uuid";
import type { QueueJobData, QueueJobResult, SSEMessage } from "@repo/types";

/** BullMQ bundles its own ioredis types; root `ioredis` instance is structurally compatible at runtime. */
const bullConnection = redis as unknown as ConnectionOptions;

const queueConfig = {
  connection: bullConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: "exponential" as const,
      delay: 2000,
    },
  },
};

const withOptionalJobId = (
  base: Omit<SSEMessage, "jobId">,
  jobId: string | undefined
): SSEMessage => {
  if (jobId === undefined) {
    return base;
  }
  return { ...base, jobId };
};

// Create the Mist API queue
export const mistQueue = new Queue("mist-api", queueConfig);

// Worker for processing Mist API requests
export const mistWorker = new Worker(
  "mist-api",
  async (job: Job<QueueJobData>): Promise<QueueJobResult> => {
    const { requestId, clientId, endpoint, method, headers, body } = job.data;
    const jobId = job.id;

    try {
      console.log(`[mist-queue] Processing job ${jobId} for request ${requestId}`);

      sseManager.sendToClient(
        clientId,
        withOptionalJobId(
          {
            type: "queue-started",
            requestId,
            timestamp: Date.now(),
          },
          jobId
        )
      );

      const fetchHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...(headers ?? {}),
      };
      const init: RequestInit = { method, headers: fetchHeaders };
      if (body !== undefined && body !== null) {
        init.body = JSON.stringify(body);
      }
      const response = await fetch(endpoint, init);

      const data: unknown = await response.json();

      const apiError =
        !response.ok
          ? typeof data === "object" &&
            data !== null &&
            "message" in data &&
            typeof (data as { message: unknown }).message === "string"
            ? (data as { message: string }).message
            : "API request failed"
          : undefined;

      const result: QueueJobResult = {
        requestId,
        success: response.ok,
        statusCode: response.status,
        ...(response.ok ? { data } : {}),
        ...(apiError !== undefined ? { error: apiError } : {}),
      };

      const completeBase: Omit<SSEMessage, "jobId"> = {
        type: response.ok ? "queue-complete" : "queue-error",
        requestId,
        timestamp: Date.now(),
      };
      if (result.data !== undefined) {
        completeBase.data = result.data;
      }
      if (result.error !== undefined) {
        completeBase.error = result.error;
      }
      sseManager.sendToClient(clientId, withOptionalJobId(completeBase, jobId));

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[mist-queue] Job ${jobId} failed:`, error);

      const result: QueueJobResult = {
        requestId,
        success: false,
        error: errorMessage,
      };

      sseManager.sendToClient(
        clientId,
        withOptionalJobId(
          {
            type: "queue-error",
            requestId,
            error: errorMessage,
            timestamp: Date.now(),
          },
          jobId
        )
      );

      return result;
    }
  },
  {
    connection: bullConnection,
    concurrency: Number.parseInt(process.env.MIST_QUEUE_CONCURRENCY || "5", 10),
  }
);

// Queue management functions
export const queueMistRequest = async (
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    body?: unknown;
    clientId: string;
  }
): Promise<{ requestId: string; jobId: string }> => {
  const requestId = uuidv4();
  const { method = 'GET', headers, body, clientId } = options;

  const job = await mistQueue.add('mist-request', {
    requestId,
    clientId,
    endpoint,
    method,
    headers,
    body,
  });

  console.log(`[mist-queue] Queued request ${requestId} as job ${job.id}`);
  
  return { requestId, jobId: job.id! };
};

// Get queue statistics
export const getQueueStats = async () => {
  const waiting = await mistQueue.getWaiting();
  const active = await mistQueue.getActive();
  const completed = await mistQueue.getCompleted();
  const failed = await mistQueue.getFailed();

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
    total: waiting.length + active.length + completed.length + failed.length,
  };
};

// Graceful shutdown
export const shutdownQueue = async () => {
  console.log('[mist-queue] Shutting down queue and worker...');
  await mistWorker.close();
  await mistQueue.close();
};