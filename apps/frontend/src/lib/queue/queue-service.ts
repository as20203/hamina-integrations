import { v4 as uuidv4 } from "uuid";
import type { QueuedRequest, SSEMessage, QueueServiceStats } from "@repo/types";

class QueueService {
  private eventSource: EventSource | null = null;
  private pendingRequests = new Map<string, Omit<QueuedRequest, "requestId">>();
  private clientId = uuidv4();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private lastSseUrl = "";

  /**
   * Same-origin SSE so the browser never calls Express directly (Docker hostname `backend` is not resolvable in the browser).
   */
  private getSseUrl(): string {
    return `/api/mist/events/${encodeURIComponent(this.clientId)}`;
  }

  private connect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    const sseUrl = this.getSseUrl();
    this.lastSseUrl = sseUrl;
    console.log(`[queue-service] Connecting to SSE (same-origin): ${sseUrl}`);

    this.eventSource = new EventSource(sseUrl);

    this.eventSource.onopen = () => {
      console.log("[queue-service] SSE connection opened");
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
    };

    this.eventSource.onmessage = (event) => {
      try {
        const message: SSEMessage = JSON.parse(event.data);
        this.handleSSEMessage(message);
      } catch (error) {
        console.warn("[queue-service] Failed to parse SSE message:", error);
      }
    };

    this.eventSource.onerror = () => {
      const es = this.eventSource;
      const state = es?.readyState;
      const label =
        state === EventSource.CONNECTING
          ? "CONNECTING"
          : state === EventSource.OPEN
            ? "OPEN"
            : "CLOSED";
      console.warn(
        `[queue-service] SSE issue (readyState=${label}, url=${this.lastSseUrl}). ` +
          "If this repeats, confirm the backend is running and BACKEND_INTERNAL_URL is set for the Next.js server (e.g. http://127.0.0.1:4000 locally, http://backend:4000 in Docker)."
      );
      es?.close();

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        console.log(`[queue-service] Reconnecting SSE in ${delay}ms (attempt ${this.reconnectAttempts})`);
        setTimeout(() => {
          this.connect();
        }, delay);
      } else {
        console.warn("[queue-service] SSE: max reconnection attempts reached (queue callbacks may not work until reload)");
      }
    };
  }

  /** Open SSE when we actually need queue + API calls (avoids noisy errors on idle pages). */
  private ensureSseConnected(): void {
    if (
      this.eventSource &&
      (this.eventSource.readyState === EventSource.OPEN ||
        this.eventSource.readyState === EventSource.CONNECTING)
    ) {
      return;
    }
    this.connect();
  }

  private handleSSEMessage(message: SSEMessage): void {
    if (message.type === "ping") {
      return;
    }

    if (message.type === "connected") {
      return;
    }

    if (!message.requestId) {
      return;
    }

    const request = this.pendingRequests.get(message.requestId);
    if (!request) {
      return;
    }

    switch (message.type) {
      case "queue-complete":
        request.resolve(message.data);
        this.pendingRequests.delete(message.requestId);
        break;

      case "queue-error":
        request.reject(new Error(message.error || "Queue processing failed"));
        this.pendingRequests.delete(message.requestId);
        break;

      case "queue-started":
        break;

      default:
        console.warn("[queue-service] Unknown SSE message type:", message.type);
    }
  }

  async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    this.ensureSseConnected();

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "X-Client-ID": this.clientId,
          ...options.headers,
        },
      });
    } catch (error) {
      const hint =
        "Could not reach this app’s API route. If you use Docker, set BACKEND_INTERNAL_URL on the frontend service so Next.js can proxy to Express.";
      if (error instanceof TypeError) {
        throw new Error(`${error.message} — ${hint}`);
      }
      throw error;
    }

    const contentType = response.headers.get("content-type") ?? "";
    let data: unknown;
    if (contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch {
        throw new Error(`Invalid JSON from ${url} (HTTP ${response.status})`);
      }
    } else {
      const text = await response.text();
      throw new Error(text || `Unexpected response HTTP ${response.status} from ${url}`);
    }

    const payload = data as Record<string, unknown>;

    if (payload.isQueued === true && typeof payload.requestId === "string") {
      return new Promise<T>((resolve, reject) => {
        this.pendingRequests.set(payload.requestId as string, {
          resolve: resolve as (data: unknown) => void,
          reject,
          timestamp: Date.now(),
        });

        setTimeout(() => {
          if (this.pendingRequests.has(payload.requestId as string)) {
            this.pendingRequests.delete(payload.requestId as string);
            reject(new Error("Queue request timeout"));
          }
        }, 300_000);
      });
    }

    if (!response.ok) {
      const errMsg =
        typeof payload.error === "string"
          ? payload.error
          : `HTTP ${response.status}`;
      throw new Error(`${errMsg} (${url})`);
    }

    return data as T;
  }

  getStats(): QueueServiceStats {
    return {
      connectedToSSE: this.eventSource?.readyState === EventSource.OPEN,
      pendingRequests: this.pendingRequests.size,
    };
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    for (const request of this.pendingRequests.values()) {
      request.reject(new Error("Queue service disconnected"));
    }
    this.pendingRequests.clear();
  }
}

let queueServiceInstance: QueueService | null = null;

export const getQueueService = (): QueueService => {
  if (typeof window === "undefined") {
    return {
      request: async <T>(url: string, options: RequestInit = {}): Promise<T> => {
        const response = await fetch(url, options);
        const data = (await response.json()) as unknown;
        if (!response.ok) {
          const body = data as { error?: string };
          throw new Error(body.error || `HTTP ${response.status}`);
        }
        return data as T;
      },
      getStats: () => ({ connectedToSSE: false, pendingRequests: 0 }),
      disconnect: () => {},
    } as QueueService;
  }

  if (!queueServiceInstance) {
    queueServiceInstance = new QueueService();
  }

  return queueServiceInstance;
};

export const useQueueService = () => {
  return getQueueService();
};
