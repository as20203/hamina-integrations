import { v4 as uuidv4 } from 'uuid';
import type { QueuedRequest, SSEMessage, QueueServiceStats } from '@repo/types';

class QueueService {
  private eventSource: EventSource | null = null;
  private pendingRequests = new Map<string, Omit<QueuedRequest, 'requestId'>>();
  private clientId = uuidv4();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second

  constructor() {
    this.connect();
  }

  private connect(): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
    const sseUrl = `${backendUrl}/api/v1/mist/events/${this.clientId}`;
    
    console.log(`[queue-service] Connecting to SSE: ${sseUrl}`);
    
    this.eventSource = new EventSource(sseUrl);

    this.eventSource.onopen = () => {
      console.log('[queue-service] SSE connection opened');
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
    };

    this.eventSource.onmessage = (event) => {
      try {
        const message: SSEMessage = JSON.parse(event.data);
        this.handleSSEMessage(message);
      } catch (error) {
        console.warn('[queue-service] Failed to parse SSE message:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('[queue-service] SSE connection error:', error);
      this.eventSource?.close();
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        console.log(`[queue-service] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
          this.connect();
        }, delay);
      } else {
        console.error('[queue-service] Max reconnection attempts reached');
      }
    };
  }

  private handleSSEMessage(message: SSEMessage): void {
    console.log('[queue-service] Received SSE message:', message);

    if (message.type === 'ping') {
      return; // Ignore ping messages
    }

    if (message.type === 'connected') {
      console.log('[queue-service] SSE connection confirmed');
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
      case 'queue-complete':
        request.resolve(message.data);
        this.pendingRequests.delete(message.requestId);
        break;
      
      case 'queue-error':
        request.reject(new Error(message.error || 'Queue processing failed'));
        this.pendingRequests.delete(message.requestId);
        break;
      
      case 'queue-started':
        console.log(`[queue-service] Request ${message.requestId} started processing`);
        break;
      
      default:
        console.warn('[queue-service] Unknown SSE message type:', message.type);
    }
  }

  async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const requestId = uuidv4();
    
    try {
      // Make the HTTP request
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': this.clientId,
          ...options.headers,
        },
      });

      const data = await response.json();
      
      // Check if the response indicates a queued request
      if (data.isQueued && data.requestId) {
        console.log(`[queue-service] Request queued: ${data.requestId}`);
        
        // Return a promise that resolves when the SSE message arrives
        return new Promise<T>((resolve, reject) => {
          this.pendingRequests.set(data.requestId, {
            resolve: resolve as (data: unknown) => void,
            reject,
            timestamp: Date.now(),
          });

          // Set a timeout to avoid hanging forever
          setTimeout(() => {
            if (this.pendingRequests.has(data.requestId)) {
              this.pendingRequests.delete(data.requestId);
              reject(new Error('Queue request timeout'));
            }
          }, 300000); // 5 minute timeout
        });
      }

      // Regular response
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('[queue-service] Request failed:', error);
      throw error;
    }
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
    
    // Reject all pending requests
    for (const request of this.pendingRequests.values()) {
      request.reject(new Error('Queue service disconnected'));
    }
    this.pendingRequests.clear();
  }
}

// Global instance
let queueServiceInstance: QueueService | null = null;

export const getQueueService = (): QueueService => {
  if (typeof window === 'undefined') {
    // Server-side: return a mock that just does regular fetch
    return {
      request: async <T>(url: string, options: RequestInit = {}): Promise<T> => {
        const response = await fetch(url, options);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }
        return data;
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

// React hook for using the queue service
export const useQueueService = () => {
  return getQueueService();
};