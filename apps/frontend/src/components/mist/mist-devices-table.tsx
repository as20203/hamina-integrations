"use client";

import type {
  MistDeviceStatus,
  MistDeviceSummary,
  MistDeviceType,
  MistDeviceDetail,
  MistDeviceStreamStats,
  MistDeviceStatsStreamStatus,
  InventoryDevice,
  ApiResponse,
} from "@/types/mist";
import { Badge } from "@repo/ui/components/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { DeviceStatusBadge } from "./device-status-badge";
import { useEffect, useState } from "react";
import { useQueueService } from "@/lib/queue/queue-service";
import { formatUnixSeconds } from "@/lib/mist/format";
import { normalizeDeviceMac } from "@/lib/mist/mac";
import { shouldSkipNavigationForTextSelection } from "@/lib/skip-navigation-if-text-selection";
import { RefreshCw, Users } from "lucide-react";

type MistDevicesTableProps = {
  siteId: string;
  devices: MistDeviceSummary[];
  devicesLoading?: boolean;
  mergedById?: Map<string, MistDeviceDetail>;
  liveByMac?: Map<string, MistDeviceStreamStats>;
  streamStatus?: MistDeviceStatsStreamStatus;
};

type EnhancedDeviceData = {
  inventory?: InventoryDevice;
  clientCount?: number;
};

const typeLabel = (t: MistDeviceType) => {
  if (t === "ap") return "AP";
  if (t === "switch") return "Switch";
  return "Unknown";
};

const numFromUnknown = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const mergedStatsLastSeen = (merged: MistDeviceDetail | undefined): number | undefined => {
  if (!merged?.stats) {
    return undefined;
  }
  return numFromUnknown(merged.stats.last_seen);
};

const resolveRowType = (catalog: MistDeviceSummary, merged: MistDeviceDetail | undefined): MistDeviceType => {
  if (catalog.type !== "unknown") {
    return catalog.type;
  }
  if (merged?.type && merged.type !== "unknown") {
    return merged.type;
  }
  return catalog.type;
};

const resolveRowStatus = (
  catalog: MistDeviceSummary,
  merged: MistDeviceDetail | undefined,
  inventory: InventoryDevice | undefined
): MistDeviceStatus => {
  if (merged?.status && merged.status !== "unknown") {
    return merged.status;
  }
  if (catalog.status !== "unknown") {
    return catalog.status;
  }
  if (inventory) {
    return inventory.connected ? "connected" : "disconnected";
  }
  return "unknown";
};

const liveWanUp = (live: MistDeviceStreamStats | undefined): boolean | undefined => {
  if (!live?.port_stat || typeof live.port_stat !== "object") {
    return undefined;
  }
  const ps = live.port_stat as Record<string, unknown>;
  const mod = ps.module;
  if (mod && typeof mod === "object" && "up" in mod) {
    return Boolean((mod as Record<string, unknown>).up);
  }
  return undefined;
};

const MistDevicesTable = ({
  siteId,
  devices,
  devicesLoading = false,
  mergedById,
  liveByMac,
  streamStatus = "idle",
}: MistDevicesTableProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const backQs = searchParams.toString();
  const queueService = useQueueService();
  const [enhancedData, setEnhancedData] = useState<Map<string, EnhancedDeviceData>>(new Map());
  const [loading, setLoading] = useState(false);

  const streamLive = streamStatus === "connected";

  const go = (id: string) => {
    const q = backQs ? `?${backQs}` : "";
    router.push(`/site/${encodeURIComponent(siteId)}/devices/${encodeURIComponent(id)}${q}`);
  };

  useEffect(() => {
    const loadEnhancedData = async () => {
      if (devices.length === 0) return;

      setLoading(true);
      try {
        const inventoryResponse = await queueService.request<ApiResponse<InventoryDevice[]>>(
          `/api/mist/inventory?siteId=${siteId}&limit=1000`
        );
        const inventoryDevices = inventoryResponse.ok ? inventoryResponse.data || [] : [];

        const clientResponse = await queueService.request<ApiResponse<{ clients: Record<string, unknown>[] }>>(
          `/api/mist/sites/${siteId}/client-stats?limit=1000`
        );
        const clients = clientResponse.ok ? clientResponse.data?.clients || [] : [];

        const enhanced = new Map<string, EnhancedDeviceData>();

        devices.forEach((device) => {
          const inventory = inventoryDevices.find((inv) => inv.id === device.id || inv.mac === device.mac);

          const clientCount =
            device.type === "ap"
              ? clients.filter((c: Record<string, unknown>) => c.ap_id === device.id).length
              : undefined;

          enhanced.set(device.id, { inventory, clientCount });
        });

        setEnhancedData(enhanced);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    };

    void loadEnhancedData();
  }, [devices, siteId, queueService]);

  const showEmptyNotLoading = devices.length === 0 && !devicesLoading;
  const showLoadingPlaceholder = devices.length === 0 && devicesLoading;
  const showRefreshOverlay = devices.length > 0 && devicesLoading;

  const colCount = 10;

  return (
    <div className="relative rounded-xl border bg-card shadow-sm">
      {showRefreshOverlay ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/70 backdrop-blur-[1px]"
          aria-busy="true"
          aria-label="Loading devices"
        >
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : null}
      <Table aria-busy={devicesLoading || undefined}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Serial</TableHead>
            <TableHead>MAC</TableHead>
            <TableHead>IP</TableHead>
            <TableHead>Last Seen</TableHead>
            <TableHead>Clients</TableHead>
            <TableHead>Connection</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {showLoadingPlaceholder ? (
            <TableRow>
              <TableCell colSpan={colCount} className="h-32 text-center text-muted-foreground">
                <div className="flex flex-col items-center justify-center gap-3 py-4">
                  <RefreshCw className="h-8 w-8 animate-spin" aria-hidden />
                  <span className="text-sm">Loading devices…</span>
                </div>
              </TableCell>
            </TableRow>
          ) : showEmptyNotLoading ? (
            <TableRow>
              <TableCell colSpan={colCount} className="h-24 text-center text-muted-foreground">
                No devices match the current filters.
              </TableCell>
            </TableRow>
          ) : (
            devices.map((device) => {
              const enhanced = enhancedData.get(device.id);
              const inventory = enhanced?.inventory;
              const clientCount = enhanced?.clientCount;
              const merged = mergedById?.get(device.id);
              const rowType = resolveRowType(device, merged);
              const rowStatus = resolveRowStatus(device, merged, inventory);
              const macKey = device.mac ? normalizeDeviceMac(device.mac) : "";
              const live = macKey ? liveByMac?.get(macKey) : undefined;

              const lastSeenLive = live && numFromUnknown(live.last_seen);
              const lastSeenMerged = mergedStatsLastSeen(merged);
              const lastSeenDisplay =
                streamLive && lastSeenLive != null && lastSeenLive > 0
                  ? formatUnixSeconds(lastSeenLive)
                  : lastSeenMerged != null && lastSeenMerged > 0
                    ? formatUnixSeconds(lastSeenMerged)
                    : inventory?.modified_time
                      ? formatUnixSeconds(inventory.modified_time)
                      : "—";

              const ipDisplay =
                streamLive && live?.ip
                  ? String(live.ip)
                  : (merged?.ip ?? device.ip ?? "—");

              const clientsDisplay =
                rowType === "ap"
                  ? streamLive && live && typeof live.num_clients === "number"
                    ? live.num_clients
                    : loading
                      ? "..."
                      : (clientCount ?? 0)
                  : null;

              const wanUp = liveWanUp(live);
              const connectionNode = streamLive && live ? (
                <div className="flex flex-col gap-1">
                  <Badge variant="default" className="w-fit text-xs">
                    Live
                  </Badge>
                  {wanUp === true ? (
                    <span className="text-xs text-muted-foreground">Uplink up</span>
                  ) : wanUp === false ? (
                    <span className="text-xs text-muted-foreground">Uplink down</span>
                  ) : null}
                </div>
              ) : inventory ? (
                <Badge variant={inventory.connected ? "default" : "secondary"} className="text-xs">
                  {inventory.connected ? "Online" : "Offline"}
                </Badge>
              ) : (
                <span className="text-muted-foreground text-xs">—</span>
              );

              return (
                <TableRow
                  key={device.id}
                  className={cn("cursor-pointer select-text")}
                  tabIndex={0}
                  role="link"
                  onClick={(e) => {
                    if (shouldSkipNavigationForTextSelection(e)) {
                      return;
                    }
                    go(device.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      go(device.id);
                    }
                  }}
                >
                  <TableCell className="font-medium">{merged?.name || device.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{typeLabel(rowType)}</Badge>
                  </TableCell>
                  <TableCell>
                    <DeviceStatusBadge status={rowStatus} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{merged?.model ?? device.model ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {inventory?.serial || device.serial || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{device.mac ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{ipDisplay}</TableCell>
                  <TableCell className="text-xs">{lastSeenDisplay}</TableCell>
                  <TableCell>
                    {rowType === "ap" ? (
                      <div className="flex items-center gap-1 text-xs">
                        <Users className="h-3 w-3" />
                        {clientsDisplay}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>{connectionNode}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export { MistDevicesTable };
