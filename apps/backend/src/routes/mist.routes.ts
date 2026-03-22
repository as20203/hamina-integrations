import { Router } from "express";
import {
  getDeviceDetailController,
  getDeviceListController,
  getOrgSitesController,
  getSiteSummaryController,
  getOrgInventoryController,
  getSiteClientStatsController,
} from "../controllers/mist.controller.js";
import { validateMistDeviceQuery } from "../middleware/mist-query.middleware.js";
import { sseManager } from "../lib/sse/sse-manager.js";
import { getQueueStats } from "../lib/mist/mist-queue.js";

const mistRouter = Router();

// Existing routes
mistRouter.get("/sites", getOrgSitesController);
mistRouter.get("/sites/:siteId/site-summary", getSiteSummaryController);
mistRouter.get("/sites/:siteId/devices", validateMistDeviceQuery, getDeviceListController);
mistRouter.get("/sites/:siteId/devices/:deviceId", getDeviceDetailController);

// New inventory and client stats routes
mistRouter.get("/inventory", getOrgInventoryController);
mistRouter.get("/sites/:siteId/client-stats", getSiteClientStatsController);

// SSE endpoint for real-time queue updates
mistRouter.get("/events/:clientId", (req, res) => {
  const clientId = req.params.clientId;
  sseManager.addClient(clientId, res);
});

// Queue status endpoint
mistRouter.get("/queue/status", async (req, res) => {
  try {
    const queueStats = await getQueueStats();
    const sseStats = sseManager.getStats();
    
    res.json({
      ok: true,
      data: {
        queue: queueStats,
        sse: sseStats,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to get queue status',
    });
  }
});

export { mistRouter };
