import { NextRequest, NextResponse } from "next/server";
import { getBackendInternalBaseUrl } from "@/lib/backend-internal-url";

export const GET = async (request: NextRequest, context: { params: Promise<{ siteId: string }> }) => {
  try {
    const { siteId } = await context.params;
    const type = request.nextUrl.searchParams.get("type") || "";
    const status = request.nextUrl.searchParams.get("status") || "";
    const query = new URLSearchParams();
    if (type) {
      query.set("type", type);
    }
    if (status) {
      query.set("status", status);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${getBackendInternalBaseUrl()}/api/v1/mist/sites/${encodeURIComponent(siteId)}/devices${suffix}`,
      {
        method: "GET",
        cache: "no-store",
      }
    );
    const data = (await response.json()) as unknown;
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
};
