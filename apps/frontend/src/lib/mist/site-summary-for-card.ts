import type { InventorySummary, MistSiteSummary } from "@/types/mist";

/** Map `getSiteSummary` / stats payload to the counts site cards already display. */
export const mistSiteSummaryToInventoryCard = (s: MistSiteSummary): InventorySummary => ({
  total_devices: s.totalDevices,
  ap_count: s.byType.ap.total,
  switch_count: s.byType.switch.total,
  connected_devices: s.byType.ap.connected + s.byType.switch.connected,
});
