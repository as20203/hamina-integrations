"use client";

import type { ReactNode } from "react";
import type { MistSiteSummary } from "@/types/mist";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Router, Wifi } from "lucide-react";

type MistMetricCardsProps = {
  summary: MistSiteSummary | null;
  loading: boolean;
  /** Shown above aggregated stats (e.g. optional live stream for site device metrics). */
  liveStatsActions?: ReactNode;
};

const MistMetricCards = ({ summary, loading, liveStatsActions }: MistMetricCardsProps) => {
  if (loading && !summary) {
    return (
      <div className="space-y-4">
        {liveStatsActions ? (
          <div className="flex flex-wrap items-center gap-2">{liveStatsActions}</div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!summary) {
    if (!liveStatsActions) {
      return null;
    }
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">{liveStatsActions}</div>
      </div>
    );
  }

  const items = [
    { label: "Total devices", value: summary.totalDevices, icon: null as null },
    { label: "AP online", value: summary.byType.ap.connected, icon: "ap" as const },
    { label: "AP offline", value: summary.byType.ap.disconnected, icon: "ap" as const },
    { label: "Switch online", value: summary.byType.switch.connected, icon: "sw" as const },
    { label: "Switch offline", value: summary.byType.switch.disconnected, icon: "sw" as const },
  ];

  return (
    <div className="space-y-4">
      {liveStatsActions ? (
        <div className="flex flex-wrap items-center gap-2">{liveStatsActions}</div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => (
          <Card key={item.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
              {item.icon === "ap" ? (
                <Wifi className="h-4 w-4 text-sky-500" />
              ) : item.icon === "sw" ? (
                <Router className="h-4 w-4 text-violet-500" />
              ) : null}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight">{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export { MistMetricCards };
