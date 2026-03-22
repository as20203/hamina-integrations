"use client";

import { useCallback } from "react";
import { useQueueService } from "@/lib/queue/queue-service";
import type {
  ApiResponse,
  ClientSummary,
  EnhancedSiteInfo,
  InventoryDevice,
  InventorySummary,
} from "@/types/mist";

export const useProgressiveSiteLoader = () => {
  const queueService = useQueueService();

  const progressivelyLoadSiteData = useCallback(async (
    sitesToEnhance: EnhancedSiteInfo[],
    onSiteUpdate: (siteId: string, updates: Partial<EnhancedSiteInfo>) => void
  ) => {
    // Load inventory data for all sites in parallel
    const inventoryPromises = sitesToEnhance.map(async (site) => {
      try {
        const response = await queueService.request<ApiResponse<InventoryDevice[]>>(
          `/api/mist/inventory?siteId=${site.id}&limit=1000`
        );
        if (response.ok && Array.isArray(response.data)) {
          const devices = response.data;
          const summary: InventorySummary = {
            total_devices: devices.length,
            ap_count: devices.filter(d => d.type === 'ap').length,
            switch_count: devices.filter(d => d.type === 'switch').length,
            connected_devices: devices.filter(d => d.connected).length,
          };
          return { siteId: site.id, inventory_summary: summary };
        }
      } catch (error) {
        console.warn(`Failed to load inventory for site ${site.id}:`, error);
      }
      return null;
    });

    // Load client stats for all sites in parallel
    const clientPromises = sitesToEnhance.map(async (site) => {
      try {
        const response = await queueService.request<
          ApiResponse<{ clients: unknown[]; summary: ClientSummary }>
        >(`/api/mist/sites/${site.id}/client-stats?limit=1000`);
        if (response.ok && response.data) {
          const { summary } = response.data;
          return { siteId: site.id, client_summary: summary };
        }
      } catch (error) {
        console.warn(`Failed to load client stats for site ${site.id}:`, error);
      }
      return null;
    });

    // Process results as they come in
    const inventoryResults = await Promise.allSettled(inventoryPromises);
    const clientResults = await Promise.allSettled(clientPromises);

    // Update sites with inventory data
    inventoryResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        onSiteUpdate(result.value.siteId, { inventory_summary: result.value.inventory_summary });
      }
    });

    // Update sites with client data
    clientResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        onSiteUpdate(result.value.siteId, { client_summary: result.value.client_summary });
      }
    });
  }, [queueService]);

  return { progressivelyLoadSiteData };
};