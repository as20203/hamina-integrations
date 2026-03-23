// Mist API related types
export interface MistSiteLatLng {
  lat?: number;
  lng?: number;
}

export interface MistOrgSite {
  id: string;
  name: string;
  address?: string;
  country_code?: string;
  timezone?: string;
  latlng?: MistSiteLatLng;
  org_id?: string;
  notes?: string;
  created_time?: number;
  modified_time?: number;
}

export type MistDeviceType = "ap" | "switch" | "gateway" | "unknown";
export type MistDeviceStatus = "connected" | "disconnected" | "unknown";

export interface MistDeviceSummary {
  id: string;
  name: string;
  type: MistDeviceType;
  status: MistDeviceStatus;
  model?: string;
  mac?: string;
  serial?: string;
  ip?: string;
}

export interface MistDeviceDetail extends MistDeviceSummary {
  stats?: Record<string, unknown>;
  config?: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface MistSiteSummary {
  totalDevices: number;
  byType: {
    ap: { total: number; connected: number; disconnected: number };
    switch: { total: number; connected: number; disconnected: number };
    unknown: { total: number; connected: number; disconnected: number };
  };
}

export interface InventoryDevice {
  id: string;
  mac: string;
  serial: string;
  model: string;
  name?: string;
  type: MistDeviceType;
  site_id?: string;
  connected: boolean;
  deviceprofile_id?: string;
  created_time: number;
  modified_time: number;
}

export interface ClientStats {
  mac: string;
  hostname?: string;
  ip?: string;
  ap_id?: string;
  ssid?: string;
  rssi?: number;
  band?: string;
  last_seen: number;
  is_guest: boolean;
}

export interface ClientSummary {
  active_clients: number;
  wireless_clients: number;
}

export interface InventorySummary {
  total_devices: number;
  ap_count: number;
  switch_count: number;
  connected_devices: number;
}

export interface EnhancedSiteInfo extends MistOrgSite {
  inventory_summary?: InventorySummary;
  client_summary?: ClientSummary;
}

// Mist API request/response types
export interface MistApiHeaders {
  Authorization: string;
  Accept: string;
  'Content-Type'?: string;
}

export interface MistFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
}

export interface MistFetchMetaResult<T> {
  data: T;
  headers: Headers;
}

// Mist service method filters
export interface InventoryFilters {
  siteId?: string;
  type?: MistDeviceType;
  connected?: boolean;
  serial?: string;
  model?: string;
  mac?: string;
  limit?: number;
  page?: number;
}

export interface ClientStatsOptions {
  duration?: string;
  limit?: number;
  apId?: string;
}

export interface DeviceFilters {
  type?: MistDeviceType;
  status?: MistDeviceStatus;
}

/** Payload shape from Mist WebSocket `.../stats/devices` stream (`data` field). */
export interface MistDeviceStreamStats {
  mac?: string;
  id?: string;
  version?: string;
  ip?: string;
  ext_ip?: string;
  power_src?: string;
  uptime?: number;
  last_seen?: number;
  num_clients?: number;
  rx_bytes?: number;
  tx_bytes?: number;
  rx_pkts?: number;
  tx_pkts?: number;
  tx_bps?: number;
  rx_bps?: number;
  ip_stat?: Record<string, unknown>;
  radio_stat?: Record<string, unknown>;
  port_stat?: Record<string, unknown>;
  cpu_stat?: Record<string, unknown>;
  memory_stat?: Record<string, unknown>;
  lldp_stat?: Record<string, unknown>;
  l2tp_stat?: Record<string, unknown>;
  [key: string]: unknown;
}

export type MistDeviceStatsStreamStatus = "connected" | "reconnecting" | "disconnected" | "error" | "idle";

export type MistDeviceStatsSseMessage =
  | { type: "stream_status"; status: MistDeviceStatsStreamStatus; message?: string }
  | { type: "device_stats"; channel?: string; data: MistDeviceStreamStats };