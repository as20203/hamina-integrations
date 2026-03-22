import { Router } from "express";
import {
  getDeviceDetailController,
  getDeviceListController,
  getSiteSummaryController,
} from "../controllers/mist.controller.js";
import { validateMistDeviceQuery } from "../middleware/mist-query.middleware.js";

const mistRouter = Router();

mistRouter.get("/site-summary", getSiteSummaryController);
mistRouter.get("/devices", validateMistDeviceQuery, getDeviceListController);
mistRouter.get("/devices/:deviceId", getDeviceDetailController);

export { mistRouter };
