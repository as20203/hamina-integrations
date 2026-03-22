export type MistDeviceType = "ap" | "switch" | "unknown";

export type MistDeviceStatus = "connected" | "disconnected" | "unknown";

export type MistDeviceSummary = {
  id: string;
  name: string;
  type: MistDeviceType;
  status: MistDeviceStatus;
  model?: string;
  mac?: string;
  serial?: string;
  ip?: string;
};

export type MistDeviceDetail = MistDeviceSummary & {
  stats?: Record<string, unknown>;
  config?: Record<string, unknown>;
  raw: Record<string, unknown>;
};

export type MistSiteSummary = {
  totalDevices: number;
  byType: {
    ap: { total: number; connected: number; disconnected: number };
    switch: { total: number; connected: number; disconnected: number };
    unknown: { total: number; connected: number; disconnected: number };
  };
};
