"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type DeviceDetailSectionProps = {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
};

const DeviceDetailSection = ({ title, icon: Icon, children, className }: DeviceDetailSectionProps) => {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 border-b bg-muted/30 py-4">
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
};

type KvGridProps = {
  rows: { label: string; value: ReactNode; mono?: boolean }[];
};

const KvGrid = ({ rows }: KvGridProps) => {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="space-y-0.5">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{row.label}</dt>
          <dd className={cn("text-sm text-foreground", row.mono ? "font-mono text-xs break-all" : "")}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
};

export { DeviceDetailSection, KvGrid };
