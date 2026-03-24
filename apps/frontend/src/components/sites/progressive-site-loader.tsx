"use client";

import { useCallback } from "react";
import { useQueueService } from "@/lib/queue/queue-service";
import type { ApiResponse, ClientSummary, EnhancedSiteInfo, MistSiteSummary } from "@/types/mist";
import { mistSiteSummaryToInventoryCard } from "@/lib/mist/site-summary-for-card";

export const useProgressiveSiteLoader = () => {
  const queueService = useQueueService();

  const progressivelyLoadSiteData = useCallback(async (
    sitesToEnhance: EnhancedSiteInfo[],
    onSiteUpdate: (siteId: string, updates: Partial<EnhancedSiteInfo>) => void
  ) => {
    // Site summary (stats-backed device counts) per site
    const siteSummaryPromises = sitesToEnhance.map(async (site) => {
      try {
        const response = await queueService.request<ApiResponse<MistSiteSummary>>(
          `/api/mist/sites/${encodeURIComponent(site.id)}/site-summary`
        );
        if (response.ok && response.data) {
          return {
            siteId: site.id,
            inventory_summary: mistSiteSummaryToInventoryCard(response.data),
          };
        }
      } catch (error) {
        console.warn(`Failed to load site summary for site ${site.id}:`, error);
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
    const inventoryResults = await Promise.allSettled(siteSummaryPromises);
    const clientResults = await Promise.allSettled(clientPromises);

    // Update sites with device count summary
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