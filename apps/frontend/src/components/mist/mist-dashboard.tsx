"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MistDeviceDetail, MistSiteSummary } from "@/types/mist";
import { Button } from "@repo/ui/components/button";
import { Badge } from "@repo/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Pagination } from "@repo/ui/shared/pagination";
import { cn } from "@repo/ui/lib/utils";
import { Activity, ArrowLeft, Info, RefreshCw } from "lucide-react";
import Link from "next/link";
import { MistDevicesTable } from "./mist-devices-table";
import { MistMetricCards } from "./mist-metric-cards";
import { useMistDeviceStatsStream } from "@/hooks/use-mist-device-stats-stream";

const ITEMS_PER_PAGE = 10;

type MistDashboardProps = {
  siteId: string;
};

const streamBadgeLabel = (status: string): string => {
  if (status === "connected") return "Live stats on";
  if (status === "reconnecting") return "Live stats connecting…";
  if (status === "error") return "Live stats unavailable";
  if (status === "disconnected") return "Live stats off";
  return "Live stats…";
};

const MistDashboard = ({ siteId }: MistDashboardProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const siteDevicesInfoRef = useRef<HTMLDivElement>(null);
  const [siteDevicesInfoOpen, setSiteDevicesInfoOpen] = useState(false);
  const liveStreamBetaInfoRef = useRef<HTMLDivElement>(null);
  const [liveStreamBetaInfoOpen, setLiveStreamBetaInfoOpen] = useState(false);
  const [liveStreamOn, setLiveStreamOn] = useState(false);
  const { liveByMac, streamStatus } = useMistDeviceStatsStream(siteId, liveStreamOn);

  const [summary, setSummary] = useState<MistSiteSummary | null>(null);
  const [tableDevices, setTableDevices] = useState<MistDeviceDetail[]>([]);
  const [devicesListMeta, setDevicesListMeta] = useState<{ total: number; page: number; limit: number } | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const typeFilter = searchParams.get("type") || "";
  const statusFilter = searchParams.get("status") || "";

  const basePath = `/site/${encodeURIComponent(siteId)}`;

  const pushParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const p = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") {
          p.delete(key);
        } else {
          p.set(key, value);
        }
      }
      router.push(`${basePath}?${p.toString()}`, { scroll: false });
    },
    [basePath, router, searchParams]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const devicesQuery = new URLSearchParams();
      devicesQuery.set("page", String(page));
      devicesQuery.set("limit", String(ITEMS_PER_PAGE));
      if (typeFilter) {
        devicesQuery.set("type", typeFilter);
      }
      if (statusFilter) {
        devicesQuery.set("status", statusFilter);
      }
      const devicesSuffix = `?${devicesQuery.toString()}`;

      const [sumRes, devicesRes] = await Promise.all([
        fetch(`/api/mist/sites/${encodeURIComponent(siteId)}/site-summary`, { cache: "no-store" }),
        fetch(`/api/mist/sites/${encodeURIComponent(siteId)}/devices${devicesSuffix}`, { cache: "no-store" }),
      ]);

      const sumJson = (await sumRes.json()) as { ok?: boolean; data?: MistSiteSummary; error?: string };
      const devicesJson = (await devicesRes.json()) as {
        ok?: boolean;
        data?: MistDeviceDetail[];
        meta?: { total: number; page: number; limit: number };
        error?: string;
      };

      if (!sumRes.ok || !sumJson.ok) {
        throw new Error(sumJson.error || "Failed to load site summary");
      }
      if (!devicesRes.ok || !devicesJson.ok) {
        throw new Error(devicesJson.error || "Failed to load devices");
      }

      setSummary(sumJson.data ?? null);
      setTableDevices(devicesJson.data ?? []);
      setDevicesListMeta(devicesJson.meta ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, [siteId, typeFilter, statusFilter, page]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (loading || !devicesListMeta) {
      return;
    }
    const limit = devicesListMeta.limit || ITEMS_PER_PAGE;
    const maxPage = Math.max(1, Math.ceil(devicesListMeta.total / limit));
    if (devicesListMeta.total === 0 && page > 1) {
      pushParams({ page: "1" });
      return;
    }
    if (devicesListMeta.total > 0 && page > maxPage) {
      pushParams({ page: String(maxPage) });
    }
  }, [loading, devicesListMeta, page, pushParams]);

  useEffect(() => {
    if (!siteDevicesInfoOpen) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      const el = siteDevicesInfoRef.current;
      if (el && !el.contains(e.target as Node)) {
        setSiteDevicesInfoOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSiteDevicesInfoOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [siteDevicesInfoOpen]);

  useEffect(() => {
    if (!liveStreamBetaInfoOpen) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      const el = liveStreamBetaInfoRef.current;
      if (el && !el.contains(e.target as Node)) {
        setLiveStreamBetaInfoOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLiveStreamBetaInfoOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [liveStreamBetaInfoOpen]);

  const mergedById = useMemo(() => {
    const m = new Map<string, MistDeviceDetail>();
    for (const d of tableDevices) {
      m.set(d.id, d);
    }
    return m;
  }, [tableDevices]);

  const listLimit = devicesListMeta?.limit ?? ITEMS_PER_PAGE;
  const totalCount = devicesListMeta?.total ?? tableDevices.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / listLimit));
  const safePage = Math.min(page, totalPages);
  const pageRows = tableDevices;

  const existingParams = useMemo(() => {
    const o: Record<string, string> = {};
    searchParams.forEach((v, k) => {
      o[k] = v;
    });
    return o;
  }, [searchParams]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href="/sites">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Org sites
          </Link>
        </Button>
      </div>
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Site devices</h1>
        <div ref={siteDevicesInfoRef} className="relative shrink-0 pt-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full border-dashed text-muted-foreground shadow-sm hover:text-foreground"
            aria-expanded={siteDevicesInfoOpen}
            aria-controls="site-devices-info-panel"
            aria-label="How site devices and live stats load"
            onClick={() => setSiteDevicesInfoOpen((o) => !o)}
          >
            <Info className="h-4 w-4" aria-hidden />
          </Button>
          {siteDevicesInfoOpen ? (
            <div
              id="site-devices-info-panel"
              role="note"
              className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(calc(100vw-2rem),28rem)] rounded-xl border bg-popover p-4 text-sm leading-relaxed text-popover-foreground shadow-lg ring-1 ring-border/60"
            >
              <p className="text-muted-foreground">
                The table loads from Mist{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">GET /api/v1/sites/…/stats/devices</code>{" "}
                with server-side type/status filters and pagination (cached on the backend). Use{" "}
                <strong className="font-medium text-foreground">Stream live stats</strong> (beta) above the summary cards
                for an optional SSE feed that updates live table columns only — it does not load the device list.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <MistMetricCards
        summary={summary}
        loading={loading}
        liveStatsActions={
          <>
            <Button
              type="button"
              variant={liveStreamOn ? "default" : "outline"}
              size="sm"
              onClick={() => setLiveStreamOn((v) => !v)}
              aria-pressed={liveStreamOn}
            >
              <Activity className={cn("mr-2 h-4 w-4", liveStreamOn && "text-primary-foreground")} aria-hidden />
              {liveStreamOn ? "Stop live stats" : "Stream live stats"}
            </Button>
            <Badge variant="outline" className="text-xs font-normal text-amber-800 dark:text-amber-200">
              Beta
            </Badge>
            <div ref={liveStreamBetaInfoRef} className="relative">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                aria-expanded={liveStreamBetaInfoOpen}
                aria-controls="live-stream-beta-info-panel"
                aria-label="Live stats stream is in beta — details"
                onClick={() => setLiveStreamBetaInfoOpen((o) => !o)}
              >
                <Info className="h-4 w-4" aria-hidden />
              </Button>
              {liveStreamBetaInfoOpen ? (
                <div
                  id="live-stream-beta-info-panel"
                  role="note"
                  className="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-[min(calc(100vw-2rem),22rem)] rounded-xl border bg-popover p-3 text-sm leading-relaxed text-popover-foreground shadow-lg ring-1 ring-border/60"
                >
                  <p className="font-medium text-foreground">Live stats (beta)</p>
                  <p className="mt-2 text-muted-foreground">
                    This path is still being hardened: Mist WebSocket → backend SSE → your browser can drop or stall,
                    needs the right regional WS host (<code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">MIST_WS_BASE_URL</code>),
                    and only refreshes a subset of table columns. Treat it as a preview; reliability and UX will improve in
                    follow-up work.
                  </p>
                </div>
              ) : null}
            </div>
            {liveStreamOn ? (
              <Badge variant={streamStatus === "connected" ? "secondary" : "outline"} className="text-xs font-normal">
                {streamBadgeLabel(streamStatus)}
              </Badge>
            ) : null}
          </>
        }
      />

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={typeFilter || "all"}
          onValueChange={(v) => {
            pushParams({ type: v === "all" ? undefined : v, page: "1" });
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="ap">AP</SelectItem>
            <SelectItem value="switch">Switch</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={statusFilter || "all"}
          onValueChange={(v) => {
            pushParams({ status: v === "all" ? undefined : v, page: "1" });
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="connected">Connected</SelectItem>
            <SelectItem value="disconnected">Disconnected</SelectItem>
          </SelectContent>
        </Select>

        <Button type="button" variant="outline" size="sm" onClick={() => void fetchData()} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} aria-hidden />
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <MistDevicesTable
        siteId={siteId}
        devices={pageRows}
        devicesLoading={loading}
        mergedById={mergedById}
        liveByMac={liveStreamOn ? liveByMac : new Map()}
        streamStatus={liveStreamOn ? streamStatus : "idle"}
      />

      {totalCount > 0 ? (
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          total={totalCount}
          paramName="page"
          baseUrl={basePath}
          existingParams={existingParams}
        />
      ) : null}
    </div>
  );
};

export { MistDashboard };
