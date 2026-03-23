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
 * Map Mist device / stats rows to a coarse UI status. Mist uses many shapes (`connected` bool/string, `status` enums, etc.).
 */
const toDeviceStatus = (record: Record<string, unknown>): MistDeviceStatus => {
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
    record.status ??
      record.connection_status ??
      record.conn_status ??
      record.device_status ??
      record.cloud_connection_state ??
      record.wan_status ??
      record.oper_state ??
      record.operational_state ??
      ""
  ).toLowerCase();
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

const fetchSiteStatsDevices = async (siteId: string): Promise<Record<string, unknown>[]> => {
  const id = resolveSiteId(siteId);
  const data = await mistFetch<unknown>(`/api/v1/sites/${id}/stats/devices`);
  return asArray(data);
};

const CATALOG_PAGE_LIMIT = 100;

/** All site devices from Mist `GET /sites/{id}/devices` (paginated AP + switch), deduped by device key. */
const fetchSiteDevicesRawMerged = async (siteId: string): Promise<Record<string, unknown>[]> => {
  resolveSiteId(siteId);
  const [apRows, switchRows] = await Promise.all([
    paginateAllSiteDevicesOfType(siteId, "ap"),
    paginateAllSiteDevicesOfType(siteId, "switch"),
  ]);
  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of apRows) {
    const key = getDeviceKey(row);
    if (key) {
      byKey.set(key, row);
    }
  }
  for (const row of switchRows) {
    const key = getDeviceKey(row);
    if (key && !byKey.has(key)) {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values());
};

const fetchSiteDevicesCatalogPage = async (
  siteId: string,
  page: number,
  type?: string
): Promise<{ rows: Record<string, unknown>[]; done: boolean }> => {
  const id = resolveSiteId(siteId);
  const query: Record<string, string | undefined> = {
    limit: String(CATALOG_PAGE_LIMIT),
    page: String(page),
  };
  if (type) {
    query.type = type;
  }
  const { data } = await mistFetchWithMeta<unknown>(`/api/v1/sites/${id}/devices`, query);
  const rows = asArray(data);
  const done = rows.length < CATALOG_PAGE_LIMIT || rows.length === 0;
  return { rows, done };
};

const paginateAllSiteDevicesOfType = async (siteId: string, type: string): Promise<Record<string, unknown>[]> => {
  const all: Record<string, unknown>[] = [];
  let page = 1;
  const maxPages = 200;
  while (page <= maxPages) {
    const { rows, done } = await fetchSiteDevicesCatalogPage(siteId, page, type);
    all.push(...rows);
    if (done || rows.length === 0) {
      break;
    }
    page += 1;
  }
  return all;
};

const catalogRowToSummary = (record: Record<string, unknown>): DeviceSummary => {
  const id = getDeviceKey(record);
  const summary: DeviceSummary = {
    id: id || "unknown",
    name: String(record.name || record.hostname || record.device_name || id || "Unknown Device"),
    type: toDeviceType(record),
    status: toDeviceStatus(record),
  };
  if (record.model != null && String(record.model) !== "") {
    summary.model = String(record.model);
  }
  if (record.mac != null && String(record.mac) !== "") {
    summary.mac = String(record.mac);
  }
  if (record.serial != null && String(record.serial) !== "") {
    summary.serial = String(record.serial);
  }
  if (record.ip != null && String(record.ip) !== "") {
    summary.ip = String(record.ip);
  }
  return summary;
};

const siteCatalogMemoryCache = new Map<string, { expiresAt: number; list: DeviceSummary[] }>();
const SITE_CATALOG_MEMORY_TTL_MS = 45_000;

const fetchSiteDevicesCatalogMerged = async (siteId: string): Promise<DeviceSummary[]> => {
  const raw = await fetchSiteDevicesRawMerged(siteId);
  return raw.map((row) => catalogRowToSummary(row));
};

/**
 * Full site device inventory from Mist `GET /api/v1/sites/{id}/devices` (paginated AP + switch passes, deduped).
 * Short in-memory TTL so the site dashboard and the live-stats WebSocket hub don’t double-hit Mist on every page load.
 */
const getSiteDevicesCatalog = async (siteId: string): Promise<DeviceSummary[]> => {
  const id = resolveSiteId(siteId);
  const now = Date.now();
  const hit = siteCatalogMemoryCache.get(id);
  if (hit && hit.expiresAt > now) {
    return hit.list;
  }
  const list = await fetchSiteDevicesCatalogMerged(siteId);
  siteCatalogMemoryCache.set(id, { expiresAt: now + SITE_CATALOG_MEMORY_TTL_MS, list });
  return list;
};

const buildMergedDevices = async (siteId: string): Promise<MistDeviceDetail[]> => {
  const id = resolveSiteId(siteId);
  return cache.getOrSet(id, CACHE_CONFIGS.SITE_INVENTORY, async () => {
    const [statsDevices, siteDevices] = await Promise.all([
      fetchSiteStatsDevices(siteId),
      fetchSiteDevicesRawMerged(siteId),
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
  });
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

const getDeviceList = async (
  siteId: string,
  type?: DeviceTypeFilter,
  status?: DeviceStatusFilter
): Promise<MistDeviceDetail[]> => {
  const raw = await buildMergedDevices(siteId);
  const devices = await enrichUnknownStatusFromOrgInventory(resolveSiteId(siteId), raw);
  return filterDevices(devices, type, status);
};

const fetchSiteDeviceConfigById = async (siteId: string, deviceId: string): Promise<Record<string, unknown> | null> => {
  const sid = resolveSiteId(siteId);
  const enc = encodeURIComponent(deviceId.trim());
  try {
    const data = await mistFetch<unknown>(`/api/v1/sites/${sid}/devices/${enc}`);
    const row = asRecord(data);
    return Object.keys(row).length > 0 ? row : null;
  } catch {
    return null;
  }
};

const getDeviceDetail = async (siteId: string, deviceId: string): Promise<MistDeviceDetail | null> => {
  const decoded = decodeURIComponent(deviceId).trim();
  if (!decoded) {
    return null;
  }

  const rawList = await buildMergedDevices(siteId);
  const devices = await enrichUnknownStatusFromOrgInventory(resolveSiteId(siteId), rawList);
  const fromList =
    devices.find((device) => device.id === decoded) ||
    (normalizeMacForMatch(decoded).length >= 6
      ? devices.find((d) => d.mac && normalizeMacForMatch(d.mac) === normalizeMacForMatch(decoded))
      : undefined);
  if (fromList) {
    return fromList;
  }

  const direct = await fetchSiteDeviceConfigById(siteId, decoded);
  if (!direct) {
    return null;
  }

  if (toDeviceType(direct) !== "ap") {
    return normalizeDevice(direct);
  }

  const key = getDeviceKey(direct);
  const statsDevices = await fetchSiteStatsDevices(siteId);
  const statsRow =
    statsDevices.find((s) => getDeviceKey(s) === key) ||
    (String(direct.mac || "").length >= 6
      ? statsDevices.find(
          (s) => normalizeMacForMatch(String(s.mac || "")) === normalizeMacForMatch(String(direct.mac || ""))
        )
      : undefined);
  if (statsRow) {
    return normalizeDevice(statsRow, direct);
  }
  return normalizeDevice(direct);
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

/** Fill `unknown` connection status from org inventory (helps switches where site `/devices` omits status fields). */
const enrichUnknownStatusFromOrgInventory = async (
  siteId: string,
  devices: MistDeviceDetail[]
): Promise<MistDeviceDetail[]> => {
  if (!devices.some((d) => d.status === "unknown")) {
    return devices;
  }
  try {
    const { devices: inv } = await getOrgInventory({ siteId, limit: 1000, page: 1 });
    if (inv.length === 0) {
      return devices;
    }
    const byId = new Map(inv.map((r) => [r.id, r]));
    const byMac = new Map<string, InventoryDevice>();
    for (const r of inv) {
      if (r.mac) {
        const k = normalizeMacForMatch(r.mac);
        if (k.length >= 6) {
          byMac.set(k, r);
        }
      }
    }
    return devices.map((d) => {
      if (d.status !== "unknown") {
        return d;
      }
      const invRow =
        byId.get(d.id) ??
        (d.mac && normalizeMacForMatch(d.mac).length >= 6 ? byMac.get(normalizeMacForMatch(d.mac)) : undefined);
      if (!invRow) {
        return d;
      }
      return { ...d, status: invRow.connected ? ("connected" as const) : ("disconnected" as const) };
    });
  } catch {
    return devices;
  }
};

const getSiteSummary = async (siteId: string): Promise<SiteSummary> => {
  const raw = await buildMergedDevices(siteId);
  const devices = await enrichUnknownStatusFromOrgInventory(resolveSiteId(siteId), raw);
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
    } else {
      // disconnected, or unknown (common for switches with no WS/REST link state) → offline for cards
      bucket.disconnected += 1;
    }
  });

  return summary;
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
      const raw = await mistFetch<unknown>(`/api/v1/sites/${id}/stats/clients`, query);
      const data = asArray(raw);

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
