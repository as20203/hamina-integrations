import { mistFetch, mistFetchWithMeta, readPaginationMeta } from "../lib/mist/client.js";
import { getMistConfig } from "../lib/mist/config.js";

type DeviceTypeFilter = "ap" | "switch";
type DeviceStatusFilter = "connected" | "disconnected";

type DeviceSummary = {
  id: string;
  name: string;
  type: "ap" | "switch" | "unknown";
  status: "connected" | "disconnected" | "unknown";
  model?: string;
  mac?: string;
  serial?: string;
  ip?: string;
};

type MistDeviceDetail = DeviceSummary & {
  stats?: Record<string, unknown>;
  config?: Record<string, unknown>;
  raw: Record<string, unknown>;
};

type SiteSummary = {
  totalDevices: number;
  byType: {
    ap: { total: number; connected: number; disconnected: number };
    switch: { total: number; connected: number; disconnected: number };
    unknown: { total: number; connected: number; disconnected: number };
  };
};

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

const toDeviceType = (value: unknown): DeviceSummary["type"] => {
  const str = String(value || "").toLowerCase();
  if (str.includes("ap") || str.includes("access")) {
    return "ap";
  }
  if (str.includes("switch")) {
    return "switch";
  }
  return "unknown";
};

const toDeviceStatus = (record: Record<string, unknown>): DeviceSummary["status"] => {
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
    type: toDeviceType(merged.type || merged.device_type || merged.model),
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

  const normalized = statsDevices.map((stats) => {
    const key = getDeviceKey(stats);
    const config = key ? byKey.get(key) : undefined;
    return normalizeDevice(stats, config);
  });

  if (normalized.length === 0) {
    return siteDevices.map((device) => normalizeDevice(device));
  }

  return normalized;
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

type MistOrgSite = Record<string, unknown>;

const getOrgSites = async (
  limit: number,
  page: number
): Promise<{ sites: MistOrgSite[]; meta: { total: number; page: number; limit: number } }> => {
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
    const bucket = summary.byType[device.type];
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

export { getOrgSites, getSiteSummary, getDeviceList, getDeviceDetail };
export type { MistDeviceDetail, DeviceTypeFilter, DeviceStatusFilter, SiteSummary, MistOrgSite };
