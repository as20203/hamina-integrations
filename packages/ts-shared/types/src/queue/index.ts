// Queue and SSE related types
import type { Response } from "express";

export interface QueueJobData {
  requestId: string;
  clientId: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  retryCount?: number;
}

export interface QueueJobResult {
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  statusCode?: number;
}

export interface QueuedRequest {
  requestId: string;
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

/** Express response used for Server-Sent Events (not Fetch `Response`). */
export interface SSEClient {
  id: string;
  response: Response;
  lastPing: number;
}

export interface SSEMessage {
  type: string;
  requestId?: string;
  jobId?: string | number;
  data?: unknown;
  error?: string;
  timestamp: number;
}

export interface QueueServiceStats {
  connectedToSSE: boolean;
  pendingRequests: number;
  lastMessage?: SSEMessage;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  total: number;
}

export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxConcurrentRequests: number;
  retryAfterMs: number;
}

export interface QueuedResponse {
  isQueued: true;
  requestId: string;
  jobId: string;
}

export interface ImmediateResponse<T> {
  isQueued: false;
  data: T;
}

export type RateLimitedResponse<T> = QueuedResponse | ImmediateResponse<T>;