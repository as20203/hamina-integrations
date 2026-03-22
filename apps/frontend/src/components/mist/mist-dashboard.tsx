"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MistDeviceSummary, MistSiteSummary } from "@/types/mist";
import { Button } from "@repo/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Pagination } from "@repo/ui/shared/pagination";
import { cn } from "@repo/ui/lib/utils";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { MistDevicesTable } from "./mist-devices-table";
import { MistMetricCards } from "./mist-metric-cards";

const ITEMS_PER_PAGE = 10;

type MistDashboardProps = {
  siteId: string;
};

const MistDashboard = ({ siteId }: MistDashboardProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<MistSiteSummary | null>(null);
  const [devices, setDevices] = useState<MistDeviceSummary[]>([]);
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
      const qs = new URLSearchParams();
      if (typeFilter) qs.set("type", typeFilter);
      if (statusFilter) qs.set("status", statusFilter);

      const [sumRes, devRes] = await Promise.all([
        fetch(`/api/mist/sites/${encodeURIComponent(siteId)}/site-summary`, { cache: "no-store" }),
        fetch(`/api/mist/sites/${encodeURIComponent(siteId)}/devices?${qs}`, { cache: "no-store" }),
      ]);

      const sumJson = (await sumRes.json()) as { ok?: boolean; data?: MistSiteSummary; error?: string };
      const devParsed = (await devRes.json()) as { ok?: boolean; data?: MistDeviceSummary[]; error?: string };

      if (!sumRes.ok || !sumJson.ok) {
        throw new Error(sumJson.error || "Failed to load site summary");
      }
      if (!devRes.ok || !devParsed.ok) {
        throw new Error(devParsed.error || "Failed to load devices");
      }

      setSummary(sumJson.data ?? null);
      setDevices(devParsed.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, [siteId, statusFilter, typeFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const totalPages = Math.max(1, Math.ceil(devices.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return devices.slice(start, start + ITEMS_PER_PAGE);
  }, [devices, safePage]);

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Site devices</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Mist AP and switch health for this site — select a row to open the device view.
        </p>
      </div>

      <MistMetricCards summary={summary} loading={loading} />

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

      <MistDevicesTable siteId={siteId} devices={pageSlice} devicesLoading={loading} />

      {devices.length > 0 ? (
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          total={devices.length}
          paramName="page"
          baseUrl={basePath}
          existingParams={existingParams}
        />
      ) : null}
    </div>
  );
};

export { MistDashboard };
