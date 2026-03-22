import WebSocket from "ws";
import type { Response } from "express";
import { getMistConfig, getMistWsBaseUrl } from "./config.js";
import { getSiteDevicesCatalog } from "../../services/mist.service.js";

type StreamStatus = "connected" | "reconnecting" | "disconnected" | "error";

const normalizeMac = (raw: string): string => raw.replace(/[^a-f0-9]/gi, "").toLowerCase();

type SiteHub = {
  subscribers: Set<Response>;
  ws: WebSocket | null;
  connecting: boolean;
  allowIds: Set<string> | null;
  allowMacs: Set<string> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  pingTimer: ReturnType<typeof setInterval> | null;
  teardown: boolean;
};

class MistDeviceStatsStreamHub {
  private sites = new Map<string, SiteHub>();

  private getOrCreateSite(siteId: string): SiteHub {
    let hub = this.sites.get(siteId);
    if (!hub) {
      hub = {
        subscribers: new Set(),
        ws: null,
        connecting: false,
        allowIds: null,
        allowMacs: null,
        reconnectTimer: null,
        pingTimer: null,
        teardown: false,
      };
      this.sites.set(siteId, hub);
    }
    return hub;
  }

  addSubscriber(siteId: string, res: Response): void {
    const hub = this.getOrCreateSite(siteId);
    hub.subscribers.add(res);
    res.on("close", () => {
      this.removeSubscriber(siteId, res);
    });
    void this.ensureConnection(siteId);
  }

  removeSubscriber(siteId: string, res: Response): void {
    const hub = this.sites.get(siteId);
    if (!hub) {
      return;
    }
    hub.subscribers.delete(res);
    if (hub.subscribers.size === 0) {
      this.teardownSite(siteId);
    }
  }

  private teardownSite(siteId: string): void {
    const hub = this.sites.get(siteId);
    if (!hub) {
      return;
    }
    hub.teardown = true;
    if (hub.reconnectTimer) {
      clearTimeout(hub.reconnectTimer);
      hub.reconnectTimer = null;
    }
    if (hub.pingTimer) {
      clearInterval(hub.pingTimer);
      hub.pingTimer = null;
    }
    if (hub.ws) {
      try {
        hub.ws.close();
      } catch {
        /* ignore */
      }
      hub.ws = null;
    }
    hub.teardown = false;
    this.sites.delete(siteId);
  }

  private broadcast(siteId: string, payload: unknown): void {
    const hub = this.sites.get(siteId);
    if (!hub) {
      return;
    }
    const line = `data: ${JSON.stringify(payload)}\n\n`;
    const dead: Response[] = [];
    for (const res of hub.subscribers) {
      try {
        res.write(line);
      } catch {
        dead.push(res);
      }
    }
    dead.forEach((r) => {
      this.removeSubscriber(siteId, r);
    });
  }

  private sendStatus(siteId: string, status: StreamStatus, message?: string): void {
    this.broadcast(siteId, { type: "stream_status", status, message });
  }

  private async loadAllowlist(siteId: string, hub: SiteHub): Promise<boolean> {
    try {
      const catalog = await getSiteDevicesCatalog(siteId);
      const ids = new Set<string>();
      const macs = new Set<string>();
      for (const d of catalog) {
        if (d.id) {
          ids.add(d.id);
        }
        if (d.mac) {
          macs.add(normalizeMac(d.mac));
        }
      }
      hub.allowIds = ids;
      hub.allowMacs = macs;
      return true;
    } catch (e) {
      hub.allowIds = null;
      hub.allowMacs = null;
      // Catalog is only for stream filtering; device rows come from REST elsewhere — don’t imply a fatal “stream” failure.
      this.sendStatus(
        siteId,
        "reconnecting",
        e instanceof Error ? e.message : "Allowlist refresh failed, retrying"
      );
      return false;
    }
  }

  private isAllowed(hub: SiteHub, data: Record<string, unknown>): boolean {
    if (hub.allowIds === null || hub.allowMacs === null) {
      return false;
    }
    const id = String(data.id || "");
    const mac = normalizeMac(String(data.mac || ""));
    if (id && hub.allowIds.has(id)) {
      return true;
    }
    if (mac && hub.allowMacs.has(mac)) {
      return true;
    }
    return false;
  }

  private attachWsHandlers(siteId: string, hub: SiteHub, ws: WebSocket): void {
    ws.on("message", (buf) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(buf.toString()) as Record<string, unknown>;
      } catch {
        return;
      }
      if (msg.event !== "data") {
        return;
      }
      let deviceData: unknown = msg.data;
      if (typeof deviceData === "string") {
        try {
          deviceData = JSON.parse(deviceData) as unknown;
        } catch {
          return;
        }
      }
      if (typeof deviceData !== "object" || deviceData === null) {
        return;
      }
      const rec = deviceData as Record<string, unknown>;
      if (!this.isAllowed(hub, rec)) {
        return;
      }
      this.broadcast(siteId, {
        type: "device_stats",
        channel: msg.channel,
        data: deviceData,
      });
    });

    ws.on("error", (err) => {
      // Transient errors often precede `close` + reconnect; avoid alarming UI unless no subscribers recover.
      console.warn(`[mist-ws] ${siteId}:`, err.message);
    });

    ws.on("close", () => {
      if (hub.pingTimer) {
        clearInterval(hub.pingTimer);
        hub.pingTimer = null;
      }
      hub.ws = null;
      if (hub.teardown || hub.subscribers.size === 0) {
        this.sendStatus(siteId, "disconnected");
        return;
      }
      this.sendStatus(siteId, "reconnecting");
      const delay = Math.min(30_000, 1000 + Math.floor(Math.random() * 4000));
      hub.reconnectTimer = setTimeout(() => {
        hub.reconnectTimer = null;
        void this.ensureConnection(siteId);
      }, delay);
    });
  }

  private async openWebSocket(siteId: string, hub: SiteHub): Promise<void> {
    const { apiKey } = getMistConfig();
    const wsUrl = `${getMistWsBaseUrl()}/api-ws/v1/stream`;
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          // Mist WebSocket docs: `token <api_token>` (lowercase), unlike REST `Token`.
          Authorization: `token ${apiKey}`,
        },
      });
      hub.ws = ws;
      const connectTimeout = setTimeout(() => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        hub.ws = null;
        reject(new Error("WebSocket connect timeout"));
      }, 25_000);

      const onEarlyError = (err: Error): void => {
        clearTimeout(connectTimeout);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        hub.ws = null;
        reject(err);
      };

      ws.once("error", onEarlyError);

      ws.once("open", () => {
        clearTimeout(connectTimeout);
        ws.removeListener("error", onEarlyError);
        try {
          ws.send(JSON.stringify({ subscribe: `/sites/${siteId}/stats/devices` }));
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          hub.ws = null;
          reject(err);
          return;
        }
        this.sendStatus(siteId, "connected");
        hub.pingTimer = setInterval(() => {
          if (hub.ws?.readyState === WebSocket.OPEN) {
            try {
              hub.ws.ping();
            } catch {
              /* ignore */
            }
          }
        }, 25_000);
        this.attachWsHandlers(siteId, hub, ws);
        resolve();
      });
    });
  }

  private async ensureConnection(siteId: string): Promise<void> {
    const hub = this.sites.get(siteId);
    if (!hub || hub.subscribers.size === 0 || hub.teardown) {
      return;
    }
    if (hub.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    if (hub.connecting) {
      return;
    }
    hub.connecting = true;
    this.sendStatus(siteId, "reconnecting");
    try {
      const catalogOk = await this.loadAllowlist(siteId, hub);
      if (!catalogOk) {
        if (hub.subscribers.size > 0 && !hub.teardown) {
          hub.reconnectTimer = setTimeout(() => {
            hub.reconnectTimer = null;
            void this.ensureConnection(siteId);
          }, 10_000);
        }
        return;
      }
      await this.openWebSocket(siteId, hub);
    } catch (e) {
      this.sendStatus(siteId, "error", e instanceof Error ? e.message : String(e));
      if (hub.subscribers.size > 0 && !hub.teardown) {
        hub.reconnectTimer = setTimeout(() => {
          hub.reconnectTimer = null;
          void this.ensureConnection(siteId);
        }, 5000);
      }
    } finally {
      hub.connecting = false;
    }
  }

  shutdown(): void {
    for (const id of [...this.sites.keys()]) {
      this.teardownSite(id);
    }
  }
}

const mistDeviceStatsStreamHub = new MistDeviceStatsStreamHub();

const shutdownMistStatsHub = (): void => {
  mistDeviceStatsStreamHub.shutdown();
};

export { mistDeviceStatsStreamHub, shutdownMistStatsHub };
