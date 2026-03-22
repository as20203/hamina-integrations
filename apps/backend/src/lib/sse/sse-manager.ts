import type { Response } from "express";
import type { SSEClient, SSEMessage } from "@repo/types";

class SSEManager {
  private clients = new Map<string, SSEClient>();
  private pingInterval: NodeJS.Timeout;

  constructor() {
    // Send ping every 30 seconds to keep connections alive
    this.pingInterval = setInterval(() => {
      this.pingClients();
    }, 30000);
  }

  addClient(clientId: string, response: Response): void {
    // Set SSE headers
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Store client
    this.clients.set(clientId, {
      id: clientId,
      response,
      lastPing: Date.now(),
    });

    // Send initial connection message
    this.sendToClient(clientId, {
      type: 'connected',
      timestamp: Date.now(),
    });

    // Handle client disconnect
    response.on('close', () => {
      this.removeClient(clientId);
    });

    console.log(`[sse-manager] Client ${clientId} connected. Total clients: ${this.clients.size}`);
  }

  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        client.response.end();
      } catch (error) {
        // Connection might already be closed
      }
      this.clients.delete(clientId);
      console.log(`[sse-manager] Client ${clientId} disconnected. Total clients: ${this.clients.size}`);
    }
  }

  sendToClient(clientId: string, message: SSEMessage): void {
    const client = this.clients.get(clientId);
    if (!client) {
      console.warn(`[sse-manager] Client ${clientId} not found`);
      return;
    }

    try {
      const data = JSON.stringify(message);
      client.response.write(`data: ${data}\n\n`);
      client.lastPing = Date.now();
    } catch (error) {
      console.error(`[sse-manager] Failed to send message to client ${clientId}:`, error);
      this.removeClient(clientId);
    }
  }

  broadcast(message: SSEMessage): void {
    const deadClients: string[] = [];
    
    for (const [clientId, client] of this.clients) {
      try {
        const data = JSON.stringify(message);
        client.response.write(`data: ${data}\n\n`);
        client.lastPing = Date.now();
      } catch (error) {
        console.error(`[sse-manager] Failed to broadcast to client ${clientId}:`, error);
        deadClients.push(clientId);
      }
    }

    // Clean up dead clients
    deadClients.forEach(clientId => this.removeClient(clientId));
  }

  private pingClients(): void {
    const now = Date.now();
    const deadClients: string[] = [];

    for (const [clientId, client] of this.clients) {
      try {
        // Send ping
        client.response.write(`data: ${JSON.stringify({ type: 'ping', timestamp: now })}\n\n`);
        
        // Check if client is stale (no activity for 2 minutes)
        if (now - client.lastPing > 120000) {
          deadClients.push(clientId);
        }
      } catch (error) {
        deadClients.push(clientId);
      }
    }

    // Clean up dead/stale clients
    deadClients.forEach(clientId => this.removeClient(clientId));
  }

  getStats() {
    return {
      connectedClients: this.clients.size,
      clients: Array.from(this.clients.keys()),
    };
  }

  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    // Close all client connections
    for (const clientId of this.clients.keys()) {
      this.removeClient(clientId);
    }
  }
}

export const sseManager = new SSEManager();