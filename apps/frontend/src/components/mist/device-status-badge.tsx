"use client";

import type { MistDeviceStatus } from "@/types/mist";
import { Badge } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/lib/utils";
import { CheckCircle2, HelpCircle, XCircle } from "lucide-react";

const DeviceStatusBadge = ({ status }: { status: MistDeviceStatus }) => {
  if (status === "connected") {
    return (
      <Badge
        variant="secondary"
        className={cn("gap-1 border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200")}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Connected
      </Badge>
    );
  }
  if (status === "disconnected") {
    return (
      <Badge
        variant="secondary"
        className={cn("gap-1 border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200")}
      >
        <XCircle className="h-3.5 w-3.5" />
        Disconnected
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <HelpCircle className="h-3.5 w-3.5" />
      Unknown
    </Badge>
  );
};

export { DeviceStatusBadge };
