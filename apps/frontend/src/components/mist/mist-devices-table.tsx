"use client";

import type { MistDeviceStatus, MistDeviceSummary, MistDeviceType } from "@/types/mist";
import { Badge } from "@repo/ui/components/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { DeviceStatusBadge } from "./device-status-badge";

type MistDevicesTableProps = {
  siteId: string;
  devices: MistDeviceSummary[];
};

const typeLabel = (t: MistDeviceType) => {
  if (t === "ap") return "AP";
  if (t === "switch") return "Switch";
  return "Unknown";
};

const MistDevicesTable = ({ siteId, devices }: MistDevicesTableProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const backQs = searchParams.toString();

  const go = (id: string) => {
    const q = backQs ? `?${backQs}` : "";
    router.push(
      `/site/${encodeURIComponent(siteId)}/devices/${encodeURIComponent(id)}${q}`
    );
  };

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>MAC</TableHead>
            <TableHead>IP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                No devices match the current filters.
              </TableCell>
            </TableRow>
          ) : (
            devices.map((device) => (
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
                <TableCell className="font-mono text-xs">{device.mac ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{device.ip ?? "—"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export { MistDevicesTable };
