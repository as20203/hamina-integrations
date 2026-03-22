"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card";
import { MapPin } from "lucide-react";
import type { MistDeviceDetail } from "@/types/mist";

/** Map Mist map coordinates (meters) to a simple schematic position — illustrative until map image API exists. */
const schematicPosition = (xM: number, yM: number): { left: string; top: string } => {
  const lx = 50 + Math.tanh(xM / 25) * 38;
  const ty = 50 + Math.tanh(yM / 25) * 38;
  return { left: `${lx}%`, top: `${ty}%` };
};

type DeviceFloorPlacementProps = {
  device: MistDeviceDetail;
};

const DeviceFloorPlacement = ({ device }: DeviceFloorPlacementProps) => {
  const raw = device.raw;
  const xM = typeof raw.x_m === "number" ? raw.x_m : Number(raw.x_m);
  const yM = typeof raw.y_m === "number" ? raw.y_m : Number(raw.y_m);
  const heightM = typeof raw.height === "number" ? raw.height : Number(raw.height);
  const hasMeters = Number.isFinite(xM) && Number.isFinite(yM);
  const pos = hasMeters ? schematicPosition(xM, yM) : { left: "50%", top: "50%" };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 border-b bg-muted/30 py-4">
        <MapPin className="h-5 w-5 text-muted-foreground" />
        <div>
          <CardTitle className="text-base">Floor placement</CardTitle>
          <CardDescription>Coordinates from Mist map (meters). Diagram is schematic.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 pt-6 lg:grid-cols-2">
        <div
          className="relative aspect-[4/3] overflow-hidden rounded-xl border bg-gradient-to-br from-muted/80 to-muted/40"
          aria-hidden
        >
          <div className="absolute inset-3 rounded-lg border-2 border-dashed border-muted-foreground/25" />
          <div className="absolute left-2 top-2 text-[10px] font-medium uppercase text-muted-foreground">
            Building / floor (schematic)
          </div>
          <div
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow-md ring-2 ring-primary/30"
            style={{ left: pos.left, top: pos.top }}
          />
        </div>
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase text-muted-foreground">X (m)</dt>
            <dd className="font-mono">{hasMeters ? xM.toFixed(2) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-muted-foreground">Y (m)</dt>
            <dd className="font-mono">{hasMeters ? yM.toFixed(2) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-muted-foreground">Height (m)</dt>
            <dd className="font-mono">{Number.isFinite(heightM) ? heightM.toFixed(2) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-muted-foreground">Map ID</dt>
            <dd className="font-mono text-xs break-all">{String(raw.map_id ?? "—")}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
};

export { DeviceFloorPlacement };
