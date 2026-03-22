import { NextRequest, NextResponse } from "next/server";
import { getBackendInternalBaseUrl } from "@/lib/backend-internal-url";

export const GET = async (request: NextRequest) => {
  try {
    const limit = request.nextUrl.searchParams.get("limit") || "";
    const page = request.nextUrl.searchParams.get("page") || "";
    const query = new URLSearchParams();
    if (limit) {
      query.set("limit", limit);
    }
    if (page) {
      query.set("page", page);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(`${getBackendInternalBaseUrl()}/api/v1/mist/sites${suffix}`, {
      method: "GET",
      cache: "no-store",
    });
    const data = (await response.json()) as unknown;
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
};
