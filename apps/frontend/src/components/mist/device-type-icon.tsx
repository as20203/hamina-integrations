"use client";

import type { MistDeviceType } from "@/types/mist";
import { cn } from "@repo/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Router, Wifi } from "lucide-react";

const apIcon = Wifi;
const swIcon = Router;

const boxFor = (type: MistDeviceType): { Icon: LucideIcon; box: string } => {
  if (type === "ap") return { Icon: apIcon, box: "text-sky-600 bg-sky-50 dark:bg-sky-950/40" };
  if (type === "switch") return { Icon: swIcon, box: "text-violet-600 bg-violet-50 dark:bg-violet-950/40" };
  return { Icon: swIcon, box: "text-muted-foreground bg-muted" };
};

type DeviceTypeIconProps = {
  type: MistDeviceType;
  size?: "sm" | "lg";
  className?: string;
};

const DeviceTypeIcon = ({ type, size = "sm", className }: DeviceTypeIconProps) => {
  const { Icon, box } = boxFor(type);
  const dim =
    size === "lg"
      ? "h-16 w-16 rounded-2xl [&_svg]:h-9 [&_svg]:w-9"
      : "h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center border border-border/60 shadow-sm",
        dim,
        box,
        className
      )}
      aria-hidden
    >
      <Icon />
    </div>
  );
};

export { DeviceTypeIcon };
