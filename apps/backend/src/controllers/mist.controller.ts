import type { Request, Response } from "express";
import {
  getDeviceDetail,
  getDeviceList,
  getOrgSites,
  getSiteSummary,
  type DeviceStatusFilter,
  type DeviceTypeFilter,
} from "../services/mist.service.js";

const parsePositiveInt = (value: unknown, fallback: number, max?: number): number => {
  const n = typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  if (max != null && n > max) {
    return max;
  }
  return Math.floor(n);
};

const getOrgSitesController = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parsePositiveInt(req.query.limit, 12, 500);
    const page = parsePositiveInt(req.query.page, 1);
    const { sites, meta } = await getOrgSites(limit, page);
    res.status(200).json({ ok: true, data: sites, meta });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ ok: false, error: message });
  }
};

const getSiteSummaryController = async (req: Request, res: Response): Promise<void> => {
  try {
    const siteId = String(req.params.siteId ?? "").trim();
    if (!siteId) {
      res.status(400).json({ ok: false, error: "Missing site id" });
      return;
    }
    const summary = await getSiteSummary(siteId);
    res.status(200).json({ ok: true, data: summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ ok: false, error: message });
  }
};

const getDeviceListController = async (req: Request, res: Response): Promise<void> => {
  try {
    const siteId = String(req.params.siteId ?? "").trim();
    if (!siteId) {
      res.status(400).json({ ok: false, error: "Missing site id" });
      return;
    }
    const type = req.query.type as DeviceTypeFilter | undefined;
    const status = req.query.status as DeviceStatusFilter | undefined;
    const devices = await getDeviceList(siteId, type, status);
    res.status(200).json({ ok: true, data: devices });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ ok: false, error: message });
  }
};

const getDeviceDetailController = async (req: Request, res: Response): Promise<void> => {
  try {
    const siteId = String(req.params.siteId ?? "").trim();
    const deviceId = String(req.params.deviceId ?? "");
    if (!siteId) {
      res.status(400).json({ ok: false, error: "Missing site id" });
      return;
    }
    const device = await getDeviceDetail(siteId, deviceId);

    if (!device) {
      res.status(404).json({ ok: false, error: "Device not found" });
      return;
    }

    res.status(200).json({ ok: true, data: device });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ ok: false, error: message });
  }
};

export { getOrgSitesController, getSiteSummaryController, getDeviceListController, getDeviceDetailController };
