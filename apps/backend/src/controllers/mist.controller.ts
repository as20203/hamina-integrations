import type { Request, Response } from "express";
import {
  getDeviceDetail,
  getDeviceList,
  getSiteSummary,
  type DeviceStatusFilter,
  type DeviceTypeFilter,
} from "../services/mist.service.js";

const getSiteSummaryController = async (_req: Request, res: Response): Promise<void> => {
  try {
    const summary = await getSiteSummary();
    res.status(200).json({ ok: true, data: summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ ok: false, error: message });
  }
};

const getDeviceListController = async (req: Request, res: Response): Promise<void> => {
  try {
    const type = req.query.type as DeviceTypeFilter | undefined;
    const status = req.query.status as DeviceStatusFilter | undefined;
    const devices = await getDeviceList(type, status);
    res.status(200).json({ ok: true, data: devices });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ ok: false, error: message });
  }
};

const getDeviceDetailController = async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = String(req.params.deviceId ?? "");
    const device = await getDeviceDetail(deviceId);

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

export { getSiteSummaryController, getDeviceListController, getDeviceDetailController };
