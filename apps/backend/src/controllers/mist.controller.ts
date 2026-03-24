import type { Request, Response } from "express";
import { mistDeviceStatsStreamHub } from "../lib/mist/mist-device-stats-stream.js";
import {
  getDeviceDetail,
  getDeviceList,
  getOrgSites,
  getSiteSummary,
  getSiteDevicesCatalog,
  mistService,
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
    const limit = parsePositiveInt(req.query.limit, 10, 100);
    const page = parsePositiveInt(req.query.page, 1);
    const { devices, meta } = await getDeviceList(siteId, {
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      limit,
      page,
    });
    res.status(200).json({ ok: true, data: devices, meta });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ ok: false, error: message });
  }
};

const getSiteDevicesCatalogController = async (req: Request, res: Response): Promise<void> => {
  try {
    const siteId = String(req.params.siteId ?? "").trim();
    if (!siteId) {
      res.status(400).json({ ok: false, error: "Missing site id" });
      return;
    }
    const devices = await getSiteDevicesCatalog(siteId);
    res.status(200).json({ ok: true, data: devices });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ ok: false, error: message });
  }
};

const streamSiteDeviceStatsController = (req: Request, res: Response): void => {
  const siteId = String(req.params.siteId ?? "").trim();
  if (!siteId) {
    res.status(400).json({ ok: false, error: "Missing site id" });
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
  });
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
  mistDeviceStatsStreamHub.addSubscriber(siteId, res);
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

// Inventory controller
const getOrgInventoryController = async (req: Request, res: Response): Promise<void> => {
  try {
    const siteId = req.query.siteId as string | undefined;
    const type = req.query.type as "ap" | "switch" | undefined;
    const connected = req.query.connected === 'true' ? true : req.query.connected === 'false' ? false : undefined;
    const serial = typeof req.query.serial === "string" ? req.query.serial.trim() : undefined;
    const model = typeof req.query.model === "string" ? req.query.model.trim() : undefined;
    const mac = typeof req.query.mac === "string" ? req.query.mac.trim() : undefined;
    const limit = parsePositiveInt(req.query.limit, 50, 500);
    const page = parsePositiveInt(req.query.page, 1);

    const { devices, meta } = await mistService.getOrgInventory({
      ...(siteId && { siteId }),
      ...(type && { type }),
      ...(connected !== undefined && { connected }),
      ...(serial && { serial }),
      ...(model && { model }),
      ...(mac && { mac }),
      limit,
      page,
    });

    res.status(200).json({ ok: true, data: devices, meta });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ ok: false, error: message });
  }
};

// Client stats controller
const getSiteClientStatsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const siteId = String(req.params.siteId ?? "").trim();
    if (!siteId) {
      res.status(400).json({ ok: false, error: "Missing site id" });
      return;
    }

    const duration = req.query.duration as string | undefined;
    const limit = parsePositiveInt(req.query.limit, 100, 1000);
    const apId = req.query.apId as string | undefined;

    const { clients, summary } = await mistService.getSiteClientStats(siteId, {
      ...(duration && { duration }),
      limit,
      ...(apId && { apId }),
    });

    res.status(200).json({ ok: true, data: { clients, summary } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ ok: false, error: message });
  }
};

export {
  getOrgSitesController,
  getSiteSummaryController,
  getDeviceListController,
  getDeviceDetailController,
  getSiteDevicesCatalogController,
  streamSiteDeviceStatsController,
  getOrgInventoryController,
  getSiteClientStatsController,
};
