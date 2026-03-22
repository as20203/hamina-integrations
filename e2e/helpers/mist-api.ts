import type { APIRequestContext } from "@playwright/test";

export type SiteRef = { id: string; name: string };
export type DeviceRef = { id: string; name: string };

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

export const fetchFirstSite = async (request: APIRequestContext): Promise<SiteRef | null> => {
  const res = await request.get("/api/mist/sites?page=1&limit=10");
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return null;
  }
  const body = asRecord(json);
  if (!body.ok || !Array.isArray(body.data) || body.data.length === 0) {
    return null;
  }
  const raw = asRecord(body.data[0]);
  const id = String(raw.id ?? "").trim();
  if (!id) {
    return null;
  }
  const name = String(raw.name ?? "Unnamed site");
  return { id, name };
};

export const fetchFirstDeviceForSite = async (
  request: APIRequestContext,
  siteId: string
): Promise<DeviceRef | null> => {
  const res = await request.get(`/api/mist/sites/${encodeURIComponent(siteId)}/devices`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return null;
  }
  const body = asRecord(json);
  if (!body.ok || !Array.isArray(body.data) || body.data.length === 0) {
    return null;
  }
  const raw = asRecord(body.data[0]);
  const id = String(raw.id ?? "").trim();
  if (!id) {
    return null;
  }
  const name = String(raw.name ?? "");
  return { id, name: name || "Unnamed device" };
};

export const fetchDevicesForSite = async (
  request: APIRequestContext,
  siteId: string
): Promise<DeviceRef[]> => {
  const res = await request.get(`/api/mist/sites/${encodeURIComponent(siteId)}/devices`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return [];
  }
  const body = asRecord(json);
  if (!body.ok || !Array.isArray(body.data)) {
    return [];
  }
  return body.data
    .map((row) => {
      const raw = asRecord(row);
      const id = String(raw.id ?? "").trim();
      if (!id) {
        return null;
      }
      const name = String(raw.name ?? "");
      return { id, name: name || "Unnamed device" };
    })
    .filter((d): d is DeviceRef => d !== null);
};
