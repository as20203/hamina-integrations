import { mistFetch, mistFetchWithMeta, readPaginationMeta } from "../lib/mist/client.js";
import { getMistConfig } from "../lib/mist/config.js";
import { cache, CACHE_CONFIGS } from "../lib/cache/redis-cache.js";
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

/** Classify device type from Mist stats/inventory fields. */
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

const truthyConnection = (v: unknown): boolean | undefined => {
  if (typeof v === "boolean") {
    return v;
  }
  if (typeof v === "number" && (v === 0 || v === 1)) {
    return v === 1;
  }
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    if (["true", "1", "yes", "up", "online", "connected", "active"].includes(s)) {
      return true;
    }
    if (["false", "0", "no", "down", "offline", "disconnected", "inactive"].includes(s)) {
      return false;
    }
  }
  return undefined;
};

/**
 * Map Mist device / stats rows to UI status.
 * For `GET …/stats/devices`, Mist exposes authoritative link state in the **`status`** string (e.g. `"connected"`, `"disconnected"`).
 * That field wins over booleans such as `wan_up` / `cloud_connected`, which can disagree with `status` on switches.
 */
const toDeviceStatus = (record: Record<string, unknown>): MistDeviceStatus => {
  const mistStatusVal = record.status;
  if (mistStatusVal != null && String(mistStatusVal).trim() !== "") {
    const ps = String(mistStatusVal).trim().toLowerCase();
    if (ps === "disconnected" || ps.includes("disconnect") || ps.includes("offline")) {
      return "disconnected";
    }
    if (ps === "connected" || ps.includes("online")) {
      return "connected";
    }
    if (ps.includes("down")) {
      return "disconnected";
    }
    if (ps.includes("up") && !ps.includes("down")) {
      return "connected";
    }
  }

  const fromBool =
    truthyConnection(record.connected) ??
    truthyConnection(record.device_connected) ??
    truthyConnection(record.deviceConnected) ??
    truthyConnection(record.cloud_connected) ??
    truthyConnection(record.lan_connected) ??
    truthyConnection(record.l2tp_connected) ??
    truthyConnection(record.wan_up);
  if (fromBool === true) {
    return "connected";
  }
  if (fromBool === false) {
    return "disconnected";
  }

  if (truthyConnection(record.disabled) === true) {
    return "disconnected";
  }

  const statusStr = String(
    record.connection_status ??
    record.conn_status ??
    record.device_status ??
    record.cloud_connection_state ??
    record.wan_status ??
    record.oper_state ??
    record.operational_state ??
    ""
  ).toLowerCase();
  // Must check disconnected/offline before "connected": e.g. "disconnected".includes("connected") is true in JS.
  if (
    statusStr.includes("disconnected") ||
    statusStr.includes("down") ||
    statusStr.includes("offline")
  ) {
    return "disconnected";
  }
  if (statusStr.includes("connected") || statusStr.includes("up") || statusStr.includes("online")) {
    return "connected";
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

const normalizeMacForMatch = (raw: string): string => raw.replace(/[^a-f0-9]/gi, "").toLowerCase();

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

const STATS_SNAPSHOT_PAGE_LIMIT = 100;

/** Walk Mist `GET …/stats/devices` with `type=all` until all pages are read (same union the table uses). */
const fetchAllSiteStatsDeviceRows = async (siteId: string): Promise<Record<string, unknown>[]> => {
  const id = resolveSiteId(siteId);
  const byKey = new Map<string, Record<string, unknown>>();
  let page = 1;
  const maxPages = 200;
  while (page <= maxPages) {
    const { data, headers } = await mistFetchWithMeta<unknown>(`/api/v1/sites/${id}/stats/devices`, {
      type: "all",
      limit: String(STATS_SNAPSHOT_PAGE_LIMIT),
      page: String(page),
    });
    const rows = asArray(data);
    for (const row of rows) {
      const key = getDeviceKey(row);
      if (key) {
        byKey.set(key, row);
      } else {
        byKey.set(`__anon_${byKey.size}`, row);
      }
    }
    if (rows.length === 0) {
      break;
    }
    const meta = readPaginationMeta(headers, page, STATS_SNAPSHOT_PAGE_LIMIT);
    if (rows.length < STATS_SNAPSHOT_PAGE_LIMIT) {
      break;
    }
    if (meta.total > 0 && page * STATS_SNAPSHOT_PAGE_LIMIT >= meta.total) {
      break;
    }
    page += 1;
  }
  return Array.from(byKey.values());
};

/**
 * Full-site device list from stats only (cached). Used for device detail resolution, devices-catalog, and WS allowlist.
 */
const getSiteStatsDevicesSnapshot = async (siteId: string): Promise<MistDeviceDetail[]> => {
  const id = resolveSiteId(siteId);
  return cache.getOrSet(id, CACHE_CONFIGS.SITE_INVENTORY, async () => {
    const rows = await fetchAllSiteStatsDeviceRows(siteId);
    return rows.map((row) => normalizeDevice(row));
  });
};

const detailToSummary = (d: MistDeviceDetail): DeviceSummary => {
  const s: DeviceSummary = {
    id: d.id,
    name: d.name,
    type: d.type,
    status: d.status,
  };
  if (d.model != null) {
    s.model = d.model;
  }
  if (d.mac != null) {
    s.mac = d.mac;
  }
  if (d.serial != null) {
    s.serial = d.serial;
  }
  if (d.ip != null) {
    s.ip = d.ip;
  }
  return s;
};

/**
 * Site device summaries from Mist stats only (same snapshot as detail lookup). Redis cache via `SITE_INVENTORY`.
 */
const getSiteDevicesCatalog = async (siteId: string): Promise<DeviceSummary[]> => {
  const details = await getSiteStatsDevicesSnapshot(siteId);
  return details.map(detailToSummary);
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
  const cacheKey = `${orgId}:${safePage}:${safeLimit}`;

  return cache.getOrSet(cacheKey, CACHE_CONFIGS.ORG_SITES, async () => {
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
  });
};

/**
 * Site device table: Mist `GET /api/v1/sites/{id}/stats/devices` with optional `type` / `status`, paginated.
 * Omitting `type` on Mist often returns AP-only rows; `type=all` (lowercase) includes switches in practice.
 * Cached per site + filters + page + limit (not merged with `/devices` inventory).
 */
const getDeviceList = async (
  siteId: string,
  options: {
    type?: DeviceTypeFilter;
    status?: DeviceStatusFilter;
    limit: number;
    page: number;
  }
): Promise<{ devices: MistDeviceDetail[]; meta: PaginationMeta }> => {
  const id = resolveSiteId(siteId);
  const safeLimit = Math.max(1, Math.min(100, Math.floor(options.limit)));
  const safePage = Math.max(1, Math.floor(options.page));
  const { type, status } = options;
  const mistType = type ?? "all";
  const cacheKey = `${id}:t:${mistType}:s:${status ?? "*"}:p:${safePage}:l:${safeLimit}`;

  return cache.getOrSet(cacheKey, CACHE_CONFIGS.SITE_STATS_DEVICES, async () => {
    const query: Record<string, string | undefined> = {
      limit: String(safeLimit),
      page: String(safePage),
      type: mistType,
    };
    if (status) {
      query.status = status;
    }

    const { data, headers } = await mistFetchWithMeta<unknown>(`/api/v1/sites/${id}/stats/devices`, query);
    const rows = asArray(data);
    const headerMeta = readPaginationMeta(headers, safePage, safeLimit);
    const devices = rows.map((row) => normalizeDevice(row));

    let total = headerMeta.total;
    if (total <= 0) {
      total =
        devices.length < safeLimit
          ? (safePage - 1) * safeLimit + devices.length
          : safePage * safeLimit + (devices.length > 0 ? 1 : 0);
    }

    return {
      devices,
      meta: { total, page: safePage, limit: safeLimit },
    };
  });
};

const getDeviceDetail = async (siteId: string, deviceId: string): Promise<MistDeviceDetail | null> => {
  const decoded = decodeURIComponent(deviceId).trim();
  if (!decoded) {
    return null;
  }

  const devices = await getSiteStatsDevicesSnapshot(siteId);
  const fromList =
    devices.find((device) => device.id === decoded) ||
    (normalizeMacForMatch(decoded).length >= 6
      ? devices.find((d) => d.mac && normalizeMacForMatch(d.mac) === normalizeMacForMatch(decoded))
      : undefined);
  return fromList ?? null;
};

// Inventory service methods
const getOrgInventory = async (filters?: InventoryFilters): Promise<{ devices: InventoryDevice[]; meta: PaginationMeta }> => {
  const { orgId } = getMistConfig();
  const cacheKey = `${orgId}:${JSON.stringify(filters || {})}`;

  return cache.getOrSet(
    cacheKey,
    CACHE_CONFIGS.ORG_INVENTORY,
    async () => {
      const limit = filters?.limit ?? 50;
      const page = filters?.page ?? 1;
      const query: Record<string, string | undefined> = {
        limit: String(limit),
        page: String(page),
      };
      if (filters?.siteId) {
        query.site_id = filters.siteId;
      }
      if (filters?.type) {
        query.type = filters.type;
      }
      if (filters?.connected !== undefined) {
        query.connected = filters.connected ? "true" : "false";
      }
      if (filters?.serial) {
        query.serial = filters.serial;
      }
      if (filters?.model) {
        query.model = filters.model;
      }
      if (filters?.mac) {
        query.mac = filters.mac;
      }

      const path = `/api/v1/orgs/${orgId}/inventory`;
      const { data, headers } = await mistFetchWithMeta<unknown>(path, query);

      const rows = asArray(data);
      const devices = rows.map((device: Record<string, unknown>): InventoryDevice => {
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

      const meta = readPaginationMeta(headers, page, limit);
      return { devices, meta: { total: meta.total, page: meta.page, limit: meta.limit } };
    }
  );
};

const summarizeDevicesToSiteSummary = (devices: MistDeviceDetail[]): SiteSummary => {
  const summary: SiteSummary = {
    totalDevices: devices.length,
    byType: {
      ap: { total: 0, connected: 0, disconnected: 0 },
      switch: { total: 0, connected: 0, disconnected: 0 },
      unknown: { total: 0, connected: 0, disconnected: 0 },
    },
  };
  for (const device of devices) {
    const bucket =
      device.type === "ap"
        ? summary.byType.ap
        : device.type === "switch"
          ? summary.byType.switch
          : summary.byType.unknown;
    bucket.total += 1;
    if (device.status === "connected") {
      bucket.connected += 1;
    } else {
      bucket.disconnected += 1;
    }
  }
  return summary;
};

/** Card counts from one full-site Mist stats snapshot (`type=all`) with server-side filtering. */
const getSiteSummary = async (siteId: string): Promise<SiteSummary> => {
  const id = resolveSiteId(siteId);
  return cache.getOrSet(id, CACHE_CONFIGS.SITE_SUMMARY, async () => {
    const devices = await getSiteStatsDevicesSnapshot(siteId);
    return summarizeDevicesToSiteSummary(devices);
  });
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

const mergeClientStatsLists = (wireless: ClientStats[], wired: ClientStats[]): ClientStats[] => {
  const byKey = new Map<string, ClientStats>();
  const keyOf = (client: ClientStats): string => {
    const mac = client.mac.trim().toLowerCase();
    const ap = (client.ap_id ?? "").trim().toLowerCase();
    const ip = (client.ip ?? "").trim().toLowerCase();
    return `${mac}|${ap}|${ip}`;
  };

  for (const client of [...wireless, ...wired]) {
    const key = keyOf(client);
    const prev = byKey.get(key);
    if (!prev || client.last_seen > prev.last_seen) {
      byKey.set(key, client);
    }
  }

  return Array.from(byKey.values());
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
      // For a specific AP, Mist's ap_id query param is unreliable; fetch a wider site list and filter by ap_id/ap/device_id.
      const responseLimit = options?.apId
        ? Math.min(1000, Math.max(300, (options.limit ?? 100) * 10))
        : Math.min(1000, options?.limit ?? 100);

      const id = resolveSiteId(siteId);
      const query: Record<string, string | undefined> = {
        limit: String(responseLimit),
      };
      if (options?.duration) {
        query.duration = options.duration;
      }
      const [wirelessRaw, wiredRaw] = await Promise.all([
        mistFetch<unknown>(`/api/v1/sites/${id}/stats/clients`, { ...query, wired: "false" }),
        mistFetch<unknown>(`/api/v1/sites/${id}/stats/clients`, { ...query, wired: "true" }),
      ]);

      let clients = mergeClientStatsLists(
        mapMistClientStatsRows(asArray(wirelessRaw)),
        mapMistClientStatsRows(asArray(wiredRaw))
      );

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
  getSiteDevicesCatalog,
};

export { getOrgSites, getSiteSummary, getDeviceList, getDeviceDetail, getSiteDevicesCatalog };
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
