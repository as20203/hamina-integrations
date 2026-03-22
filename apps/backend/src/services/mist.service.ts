import { mistFetch, mistFetchWithMeta, readPaginationMeta } from "../lib/mist/client.js";
import { getMistConfig } from "../lib/mist/config.js";
import { cache, CACHE_CONFIGS } from "../lib/cache/redis-cache.js";
import { mistRateLimiter } from "../lib/mist/rate-limiter.js";
import type {
  MistDeviceDetail,
  MistDeviceType,
  MistDeviceStatus,
  MistSiteSummary,
  InventoryDevice,
  ClientStats,
  ClientSummary,
  InventoryFilters,
  ClientStatsOptions,
  PaginationMeta,
  AsyncReturnType,
} from "@repo/types";

type DeviceTypeFilter = MistDeviceType;
type DeviceStatusFilter = MistDeviceStatus;
type DeviceSummary = Omit<MistDeviceDetail, 'stats' | 'config' | 'raw'>;
type SiteSummary = MistSiteSummary;

const asRecord = (value: unknown): Record<string, unknown> => {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
};

const asArray = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value.map(asRecord);
  }

  const record = asRecord(value);
  for (const key of ["results", "items", "data", "devices"]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate.map(asRecord);
    }
  }

  return [];
};

/**
 * Classify device type from Mist inventory fields.
 * Switches often appear only on `GET /sites/{id}/devices` with `type: "switch"`; AP stats may omit them entirely.
 */
const toDeviceType = (record: Record<string, unknown>): MistDeviceType => {
  const type = String(record.type ?? "").toLowerCase();
  const deviceType = String(record.device_type ?? "").toLowerCase();
  const family = String(record.family ?? "").toLowerCase();
  const model = String(record.model ?? "").toLowerCase();
  const haystack = `${type} ${deviceType} ${family} ${model}`;

  // Explicit Mist enums / strings first
  if (type === "switch" || deviceType === "switch") {
    return "switch";
  }
  if (type === "ap" || type === "ble" || deviceType === "ap") {
    return "ap";
  }

  if (haystack.includes("switch") || haystack.includes("junos") || haystack.includes("ex4") || haystack.includes("qfx")) {
    return "switch";
  }
  if (haystack.includes("access point") || haystack.includes("wifi") || haystack.includes("wlan")) {
    return "ap";
  }
  if (haystack.includes("ap") || haystack.includes("access")) {
    return "ap";
  }

  return "unknown";
};

const toDeviceStatus = (record: Record<string, unknown>): MistDeviceStatus => {
  const statusStr = String(record.status || record.connection_status || "").toLowerCase();
  if (statusStr.includes("connected") || statusStr.includes("up") || statusStr.includes("online")) {
    return "connected";
  }
  if (
    statusStr.includes("disconnected") ||
    statusStr.includes("down") ||
    statusStr.includes("offline")
  ) {
    return "disconnected";
  }
  if (typeof record.connected === "boolean") {
    return record.connected ? "connected" : "disconnected";
  }
  return "unknown";
};

const getDeviceKey = (record: Record<string, unknown>): string => {
  return (
    String(record.id || "") ||
    String(record.device_id || "") ||
    String(record.mac || "") ||
    String(record.serial || "")
  );
};

const normalizeDevice = (stats: Record<string, unknown>, config?: Record<string, unknown>): MistDeviceDetail => {
  const merged = { ...config, ...stats };
  const id = getDeviceKey(merged);
  const detail: MistDeviceDetail = {
    id,
    name: String(merged.name || merged.hostname || merged.device_name || id || "Unknown Device"),
    type: toDeviceType(merged),
    status: toDeviceStatus(merged),
    raw: merged,
  };
  if (merged.model != null && merged.model !== "") {
    detail.model = String(merged.model);
  }
  if (merged.mac != null && merged.mac !== "") {
    detail.mac = String(merged.mac);
  }
  if (merged.serial != null && merged.serial !== "") {
    detail.serial = String(merged.serial);
  }
  if (merged.ip != null && merged.ip !== "") {
    detail.ip = String(merged.ip);
  }
  detail.stats = stats;
  if (config && Object.keys(config).length > 0) {
    detail.config = config;
  }
  return detail;
};

const resolveSiteId = (siteId: string | undefined): string => {
  const trimmed = siteId?.trim();
  if (trimmed) {
    return trimmed;
  }
  const fallback = getMistConfig().siteId;
  if (fallback) {
    return fallback;
  }
  throw new Error("Missing site id (path param or MIST_SITE_ID)");
};

const fetchSiteStatsDevices = async (siteId: string): Promise<Record<string, unknown>[]> => {
  const id = resolveSiteId(siteId);
  const data = await mistFetch<unknown>(`/api/v1/sites/${id}/stats/devices`);
  return asArray(data);
};

const fetchSiteDevices = async (siteId: string): Promise<Record<string, unknown>[]> => {
  const id = resolveSiteId(siteId);
  const data = await mistFetch<unknown>(`/api/v1/sites/${id}/devices`);
  return asArray(data);
};

const buildMergedDevices = async (siteId: string): Promise<MistDeviceDetail[]> => {
  const [statsDevices, siteDevices] = await Promise.all([
    fetchSiteStatsDevices(siteId),
    fetchSiteDevices(siteId),
  ]);
  const byKey = new Map<string, Record<string, unknown>>();
  siteDevices.forEach((device) => {
    const key = getDeviceKey(device);
    if (key) {
      byKey.set(key, device);
    }
  });

  const normalizedFromStats = statsDevices.map((stats) => {
    const key = getDeviceKey(stats);
    const config = key ? byKey.get(key) : undefined;
    return normalizeDevice(stats, config);
  });

  if (normalizedFromStats.length === 0) {
    return siteDevices.map((device) => normalizeDevice(device));
  }

  // `/stats/devices` is AP-centric; switches (and other gear) may exist only on `/devices`.
  const keysFromStats = new Set(
    statsDevices.map((s) => getDeviceKey(s)).filter((k) => k.length > 0)
  );
  const onlyOnInventory = siteDevices.filter((device) => {
    const key = getDeviceKey(device);
    return key.length > 0 && !keysFromStats.has(key);
  });

  return [...normalizedFromStats, ...onlyOnInventory.map((d) => normalizeDevice(d))];
};

const filterDevices = (
  devices: MistDeviceDetail[],
  type?: DeviceTypeFilter,
  status?: DeviceStatusFilter
): MistDeviceDetail[] => {
  return devices.filter((device) => {
    const matchesType = !type || device.type === type;
    const matchesStatus = !status || device.status === status;
    return matchesType && matchesStatus;
  });
};

/** Raw org-site row from Mist API before controller/frontend normalization */
type OrgSiteApiRow = Record<string, unknown>;

const getOrgSites = async (
  limit: number,
  page: number
): Promise<{ sites: OrgSiteApiRow[]; meta: PaginationMeta }> => {
  const { orgId } = getMistConfig();
  const safeLimit = Math.max(1, Math.min(500, limit));
  const safePage = Math.max(1, page);
  const { data, headers } = await mistFetchWithMeta<unknown[]>(
    `/api/v1/orgs/${orgId}/sites`,
    {
      limit: String(safeLimit),
      page: String(safePage),
    }
  );

  const list = Array.isArray(data) ? data.map(asRecord) : [];
  const meta = readPaginationMeta(headers, safePage, safeLimit);
  const total = meta.total > 0 ? meta.total : list.length;

  return {
    sites: list,
    meta: { total, page: safePage, limit: safeLimit },
  };
};

const getSiteSummary = async (siteId: string): Promise<SiteSummary> => {
  const devices = await buildMergedDevices(siteId);
  const summary: SiteSummary = {
    totalDevices: devices.length,
    byType: {
      ap: { total: 0, connected: 0, disconnected: 0 },
      switch: { total: 0, connected: 0, disconnected: 0 },
      unknown: { total: 0, connected: 0, disconnected: 0 },
    },
  };

  devices.forEach((device) => {
    const bucket =
      device.type === "ap"
        ? summary.byType.ap
        : device.type === "switch"
          ? summary.byType.switch
          : summary.byType.unknown;
    bucket.total += 1;
    if (device.status === "connected") {
      bucket.connected += 1;
    } else if (device.status === "disconnected") {
      bucket.disconnected += 1;
    }
  });

  return summary;
};

const getDeviceList = async (
  siteId: string,
  type?: DeviceTypeFilter,
  status?: DeviceStatusFilter
): Promise<MistDeviceDetail[]> => {
  const devices = await buildMergedDevices(siteId);
  return filterDevices(devices, type, status);
};

const getDeviceDetail = async (siteId: string, deviceId: string): Promise<MistDeviceDetail | null> => {
  const devices = await buildMergedDevices(siteId);
  return devices.find((device) => device.id === deviceId) || null;
};

// Inventory service methods
const getOrgInventory = async (filters?: InventoryFilters): Promise<{ devices: InventoryDevice[]; meta: PaginationMeta }> => {
  const { orgId } = getMistConfig();
  const cacheKey = `${orgId}:${JSON.stringify(filters || {})}`;
  
  return cache.getOrSet(
    cacheKey,
    CACHE_CONFIGS.ORG_INVENTORY,
    async () => {
      const params = new URLSearchParams();
      if (filters?.siteId) params.append('site_id', filters.siteId);
      if (filters?.type) params.append('type', filters.type);
      if (filters?.connected !== undefined) params.append('connected', filters.connected.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.page) params.append('page', filters.page.toString());

      const endpoint = `https://api.mist.com/api/v1/orgs/${orgId}/inventory?${params.toString()}`;
      const { data, headers } = await mistFetchWithMeta(endpoint);
      
      const devices = (data as Record<string, unknown>[]).map((device: Record<string, unknown>): InventoryDevice => {
        const row: InventoryDevice = {
          id: String(device.id),
          mac: String(device.mac ?? ""),
          serial: String(device.serial ?? ""),
          model: String(device.model ?? ""),
          type: toDeviceType(device),
          connected: Boolean(device.connected),
          created_time: Number(device.created_time),
          modified_time: Number(device.modified_time),
        };
        if (device.name != null && String(device.name) !== "") {
          row.name = String(device.name);
        }
        if (device.site_id != null && String(device.site_id) !== "") {
          row.site_id = String(device.site_id);
        }
        if (device.deviceprofile_id != null && String(device.deviceprofile_id) !== "") {
          row.deviceprofile_id = String(device.deviceprofile_id);
        }
        return row;
      });

      const meta = readPaginationMeta(headers, filters?.limit || 50, filters?.page || 1);
      return { devices, meta: { total: meta.total, page: meta.page, limit: meta.limit } };
    }
  );
};

/** Mist client stat rows use varying keys for the AP reference; normalize for filtering. */
const apIdFromMistClientRow = (client: Record<string, unknown>): string | undefined => {
  for (const key of ["ap_id", "ap", "device_id"] as const) {
    const v = client[key];
    if (v != null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return undefined;
};

const mapMistClientStatsRows = (data: Record<string, unknown>[]): ClientStats[] => {
  return data.map((client: Record<string, unknown>): ClientStats => {
    const row: ClientStats = {
      mac: String(client.mac ?? ""),
      last_seen: Number(client.last_seen),
      is_guest: Boolean(client.is_guest),
    };
    const apRef = apIdFromMistClientRow(client);
    if (apRef) {
      row.ap_id = apRef;
    }
    if (client.hostname != null && String(client.hostname) !== "") {
      row.hostname = String(client.hostname);
    }
    if (client.ip != null && String(client.ip) !== "") {
      row.ip = String(client.ip);
    }
    if (client.ssid != null && String(client.ssid) !== "") {
      row.ssid = String(client.ssid);
    }
    if (client.rssi != null && String(client.rssi) !== "" && Number.isFinite(Number(client.rssi))) {
      row.rssi = Number(client.rssi);
    }
    if (client.band != null && String(client.band) !== "") {
      row.band = String(client.band);
    }
    return row;
  });
};

// Client stats service methods
const getSiteClientStats = async (
  siteId: string,
  options?: ClientStatsOptions
): Promise<{ clients: ClientStats[]; summary: ClientSummary }> => {
  const cacheKey = `${siteId}:${JSON.stringify(options || {})}`;

  return cache.getOrSet(
    cacheKey,
    CACHE_CONFIGS.CLIENT_STATS,
    async () => {
      const params = new URLSearchParams();
      if (options?.duration) {
        params.append("duration", options.duration);
      }

      // For a specific AP, Mist's ap_id query param is unreliable; fetch a wider site list and filter by ap_id/ap/device_id.
      const responseLimit = options?.apId
        ? Math.min(1000, Math.max(300, (options.limit ?? 100) * 10))
        : Math.min(1000, options?.limit ?? 100);

      params.append("limit", String(responseLimit));

      const endpoint = `https://api.mist.com/api/v1/sites/${siteId}/stats/clients?${params.toString()}`;
      const data = (await mistFetch(endpoint)) as Record<string, unknown>[];

      let clients = mapMistClientStatsRows(data);

      if (options?.apId) {
        const want = options.apId.trim().toLowerCase();
        clients = clients.filter((c) => (c.ap_id ?? "").trim().toLowerCase() === want);
        const cap = options.limit ?? 100;
        clients = clients.slice(0, cap);
      }

      const summary: ClientSummary = {
        active_clients: clients.length,
        wireless_clients: clients.filter((c: ClientStats) => c.ssid).length,
      };

      return { clients, summary };
    }
  );
};

// Service method return types using proper type inference
type GetOrgSitesReturn = AsyncReturnType<typeof getOrgSites>;
type GetSiteSummaryReturn = AsyncReturnType<typeof getSiteSummary>;
type GetDeviceListReturn = AsyncReturnType<typeof getDeviceList>;
type GetDeviceDetailReturn = AsyncReturnType<typeof getDeviceDetail>;
type GetOrgInventoryReturn = AsyncReturnType<typeof getOrgInventory>;
type GetSiteClientStatsReturn = AsyncReturnType<typeof getSiteClientStats>;

export const mistService = {
  getSiteSummary,
  getDeviceList,
  getDeviceDetail,
  getOrgSites,
  getOrgInventory,
  getSiteClientStats,
};

export { getOrgSites, getSiteSummary, getDeviceList, getDeviceDetail };
export type { 
  DeviceTypeFilter, 
  DeviceStatusFilter,
  GetOrgSitesReturn,
  GetSiteSummaryReturn,
  GetDeviceListReturn,
  GetDeviceDetailReturn,
  GetOrgInventoryReturn,
  GetSiteClientStatsReturn
};
