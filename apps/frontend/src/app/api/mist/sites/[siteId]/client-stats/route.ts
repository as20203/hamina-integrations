import { NextRequest, NextResponse } from "next/server";
import { getBackendInternalBaseUrl } from "@/lib/backend-internal-url";

/** Client-stats can be slow (Mist + large `limit`); avoid default short hangs. */
const CLIENT_STATS_PROXY_TIMEOUT_MS = 120_000;
/** Intermittent ECONNRESET / “fetch failed” between Next and Express. */
const CLIENT_STATS_PROXY_MAX_ATTEMPTS = 3;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fetchBackendWithRetries(url: string, init: Omit<RequestInit, "signal">): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < CLIENT_STATS_PROXY_MAX_ATTEMPTS; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), CLIENT_STATS_PROXY_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: ac.signal,
      });
      clearTimeout(timer);
      return response;
    } catch (e) {
      clearTimeout(timer);
      lastError = e;
      if (attempt < CLIENT_STATS_PROXY_MAX_ATTEMPTS - 1) {
        await delay(250 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await context.params;
    const { searchParams } = new URL(request.url);
    const backendUrl = `${getBackendInternalBaseUrl()}/api/v1/mist/sites/${encodeURIComponent(siteId)}/client-stats?${searchParams.toString()}`;

    const response = await fetchBackendWithRetries(backendUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Client-ID": request.headers.get("X-Client-ID") || "",
      },
    });

    const text = await response.text();
    let data: unknown;
    try {
      data = text ? (JSON.parse(text) as unknown) : {};
    } catch {
      return NextResponse.json(
        { ok: false, error: `Backend returned non-JSON (HTTP ${response.status})` },
        { status: 502 }
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const hint =
      "Check that Express is running and BACKEND_INTERNAL_URL matches (e.g. http://127.0.0.1:4000 locally, http://backend:4000 in Docker).";
    console.error("Client stats API proxy error:", error);
    return NextResponse.json({ ok: false, error: `${message}. ${hint}` }, { status: 502 });
  }
}
