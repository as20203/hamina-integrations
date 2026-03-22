"use client";

import { DeviceDetailView } from "@/components/mist/device-detail-view";
import type { MistDeviceDetail } from "@/types/mist";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const MistSiteDevicePage = () => {
  const params = useParams<{ siteId: string; deviceId: string }>();
  const searchParams = useSearchParams();
  const siteId = decodeURIComponent(params.siteId ?? "").trim();
  const id = decodeURIComponent(params.deviceId ?? "");
  const [device, setDevice] = useState<MistDeviceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const backHref = `/site/${encodeURIComponent(siteId)}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!siteId || !id) {
        setError("Missing site or device id");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/mist/sites/${encodeURIComponent(siteId)}/devices/${encodeURIComponent(id)}`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as { ok?: boolean; data?: MistDeviceDetail; error?: string };
        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Failed to load device");
        }
        if (active) {
          setDevice(json.data ?? null);
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : "Unexpected error");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [id, siteId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to devices
          </Link>
        </Button>
      </div>

      {loading ? <Skeleton className="min-h-[24rem] w-full rounded-xl" /> : null}
      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {device ? <DeviceDetailView device={device} siteId={siteId} /> : null}
    </div>
  );
};

export { MistSiteDevicePage };
