"use client";

import type { MistDeviceStatus, MistDeviceSummary, MistDeviceType, InventoryDevice, ApiResponse } from "@/types/mist";
import { Badge } from "@repo/ui/components/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { DeviceStatusBadge } from "./device-status-badge";
import { useEffect, useState } from "react";
import { useQueueService } from "@/lib/queue/queue-service";
import { formatUnixSeconds } from "@/lib/mist/format";
import { RefreshCw, Users } from "lucide-react";

type MistDevicesTableProps = {
  siteId: string;
  devices: MistDeviceSummary[];
  /** True while parent is fetching the device list (initial load or refresh). */
  devicesLoading?: boolean;
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

const MistDevicesTable = ({ siteId, devices, devicesLoading = false }: MistDevicesTableProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const backQs = searchParams.toString();
  const queueService = useQueueService();
  const [enhancedData, setEnhancedData] = useState<Map<string, EnhancedDeviceData>>(new Map());
  const [loading, setLoading] = useState(false);

  const go = (id: string) => {
    const q = backQs ? `?${backQs}` : "";
    router.push(
      `/site/${encodeURIComponent(siteId)}/devices/${encodeURIComponent(id)}${q}`
    );
  };

  // Load enhanced data for devices
  useEffect(() => {
    const loadEnhancedData = async () => {
      if (devices.length === 0) return;
      
      setLoading(true);
      try {
        // Load inventory data
        const inventoryResponse = await queueService.request<ApiResponse<InventoryDevice[]>>(`/api/mist/inventory?siteId=${siteId}&limit=1000`);
        const inventoryDevices = inventoryResponse.ok ? inventoryResponse.data || [] : [];
        
        // Load client stats for APs
        const clientResponse = await queueService.request<ApiResponse<{clients: Record<string, unknown>[]}>>(`/api/mist/sites/${siteId}/client-stats?limit=1000`);
        const clients = clientResponse.ok ? (clientResponse.data?.clients || []) : [];
        
        // Create enhanced data map
        const enhanced = new Map<string, EnhancedDeviceData>();
        
        devices.forEach(device => {
          const inventory = inventoryDevices.find(inv => 
            inv.id === device.id || inv.mac === device.mac
          );
          
          const clientCount = device.type === 'ap' 
            ? clients.filter((c: Record<string, unknown>) => c.ap_id === device.id).length 
            : undefined;
          
          enhanced.set(device.id, { inventory, clientCount });
        });
        
        setEnhancedData(enhanced);
      } catch (error) {
        console.warn('Failed to load enhanced device data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadEnhancedData();
  }, [devices, siteId, queueService]);

  const showEmptyNotLoading = devices.length === 0 && !devicesLoading;
  const showLoadingPlaceholder = devices.length === 0 && devicesLoading;
  const showRefreshOverlay = devices.length > 0 && devicesLoading;

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
              <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                <div className="flex flex-col items-center justify-center gap-3 py-4">
                  <RefreshCw className="h-8 w-8 animate-spin" aria-hidden />
                  <span className="text-sm">Loading devices…</span>
                </div>
              </TableCell>
            </TableRow>
          ) : showEmptyNotLoading ? (
            <TableRow>
              <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                No devices match the current filters.
              </TableCell>
            </TableRow>
          ) : (
            devices.map((device) => {
              const enhanced = enhancedData.get(device.id);
              const inventory = enhanced?.inventory;
              const clientCount = enhanced?.clientCount;
              
              return (
                <TableRow
                  key={device.id}
                  className={cn("cursor-pointer")}
                  tabIndex={0}
                  role="link"
                  onClick={() => go(device.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      go(device.id);
                    }
                  }}
                >
                  <TableCell className="font-medium">{device.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{typeLabel(device.type)}</Badge>
                  </TableCell>
                  <TableCell>
                    <DeviceStatusBadge status={device.status as MistDeviceStatus} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{device.model ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {inventory?.serial || device.serial || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{device.mac ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{device.ip ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {inventory?.modified_time 
                      ? formatUnixSeconds(inventory.modified_time)
                      : "—"
                    }
                  </TableCell>
                  <TableCell>
                    {device.type === 'ap' ? (
                      <div className="flex items-center gap-1 text-xs">
                        <Users className="h-3 w-3" />
                        {loading ? "..." : (clientCount ?? 0)}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {inventory ? (
                      <Badge 
                        variant={inventory.connected ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {inventory.connected ? "Online" : "Offline"}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
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
