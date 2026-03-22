import { getBackendInternalBaseUrl } from "@/lib/backend-internal-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Same-origin SSE proxy so the browser does not call Express directly
 * (avoids wrong hostnames like `http://backend:4000` from the client).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await context.params;
  const base = getBackendInternalBaseUrl();
  const url = `${base}/api/v1/mist/events/${encodeURIComponent(clientId)}`;

  const upstream = await fetch(url, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(upstream.statusText || "Upstream SSE unavailable", {
      status: upstream.status,
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
