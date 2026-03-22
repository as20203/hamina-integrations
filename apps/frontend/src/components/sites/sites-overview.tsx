"use client";

import { SiteCard } from "@/components/sites/site-card";
import type { MistOrgSite } from "@/types/mist";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const SITES_LIMIT = 10;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

const normalizeSite = (raw: Record<string, unknown>): MistOrgSite | null => {
  const id = String(raw.id ?? "").trim();
  if (!id) {
    return null;
  }
  const latlngRaw = asRecord(raw.latlng);
  const lat = typeof latlngRaw.lat === "number" ? latlngRaw.lat : Number(latlngRaw.lat);
  const lng = typeof latlngRaw.lng === "number" ? latlngRaw.lng : Number(latlngRaw.lng);
  const site: MistOrgSite = {
    id,
    name: String(raw.name ?? "Unnamed site"),
  };
  const addr = raw.address;
  if (typeof addr === "string" && addr.length > 0) {
    site.address = addr;
  }
  const cc = raw.country_code;
  if (typeof cc === "string" && cc.length > 0) {
    site.country_code = cc;
  }
  const tz = raw.timezone;
  if (typeof tz === "string" && tz.length > 0) {
    site.timezone = tz;
  }
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    site.latlng = { lat, lng };
  }
  return site;
};

const SitesOverview = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);

  const [sites, setSites] = useState<MistOrgSite[]>([]);
  const [meta, setMeta] = useState<{ total: number; page: number; limit: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchPage = useCallback(async (targetPage: number) => {
    const qs = new URLSearchParams();
    qs.set("limit", String(SITES_LIMIT));
    qs.set("page", String(targetPage));
    const res = await fetch(`/api/mist/sites?${qs.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as {
      ok?: boolean;
      data?: unknown[];
      meta?: { total?: number; page?: number; limit?: number };
      error?: string;
    };
    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Failed to load sites");
    }
    const list = Array.isArray(json.data) ? json.data : [];
    const normalized = list
      .map((item) => normalizeSite(asRecord(item)))
      .filter((s): s is MistOrgSite => s != null);
    const m = json.meta ?? {};
    const limit = typeof m.limit === "number" && m.limit > 0 ? m.limit : SITES_LIMIT;
    const total =
      typeof m.total === "number" && m.total >= 0 ? m.total : normalized.length > 0 ? normalized.length : 0;
    return {
      sites: normalized,
      meta: { total, page: targetPage, limit },
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchPage(page);
        if (!cancelled) {
          setSites(result.sites);
          setMeta(result.meta);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unexpected error");
          setSites([]);
          setMeta(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [fetchPage, page]);

  useEffect(() => {
    if (!meta || loading) {
      return;
    }
    const tp = Math.max(1, Math.ceil(meta.total / meta.limit));
    if (page > tp) {
      const p = new URLSearchParams(searchParams.toString());
      p.set("page", String(tp));
      router.replace(`/sites?${p.toString()}`, { scroll: false });
    }
  }, [loading, meta, page, router, searchParams]);

  const totalPages = useMemo(() => {
    if (!meta) {
      return 1;
    }
    return Math.max(1, Math.ceil(meta.total / meta.limit));
  }, [meta]);

  const safePage = Math.min(page, totalPages);

  const existingParams = useMemo(() => {
    const o: Record<string, string> = {};
    searchParams.forEach((v, k) => {
      o[k] = v;
    });
    return o;
  }, [searchParams]);

  const goToSite = useCallback(
    (siteId: string) => {
      router.push(`/site/${encodeURIComponent(siteId)}`);
    },
    [router]
  );

  const handleLoadMore = useCallback(() => {
    if (safePage >= totalPages) {
      return;
    }
    const p = new URLSearchParams(searchParams.toString());
    p.set("page", String(safePage + 1));
    router.push(`/sites?${p.toString()}`);
  }, [router, safePage, searchParams, totalPages]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Org sites</h1>

      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sites.length === 0 ? (
              <p className="col-span-full text-center text-sm text-muted-foreground">No sites in this page.</p>
            ) : (
              sites.map((site) => <SiteCard key={site.id} site={site} onSelect={goToSite} />)
            )}
          </div>

          {meta && safePage < totalPages ? (
            <div className="flex justify-center">
              <Button type="button" variant="secondary" onClick={handleLoadMore}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

export { SitesOverview };
