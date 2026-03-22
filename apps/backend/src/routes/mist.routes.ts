import { Router } from "express";
import {
  getDeviceDetailController,
  getDeviceListController,
  getOrgSitesController,
  getSiteSummaryController,
} from "../controllers/mist.controller.js";
import { validateMistDeviceQuery } from "../middleware/mist-query.middleware.js";

const mistRouter = Router();

mistRouter.get("/sites", getOrgSitesController);
mistRouter.get("/sites/:siteId/site-summary", getSiteSummaryController);
mistRouter.get("/sites/:siteId/devices", validateMistDeviceQuery, getDeviceListController);
mistRouter.get("/sites/:siteId/devices/:deviceId", getDeviceDetailController);

export { mistRouter };
