import { NextRequest, NextResponse } from "next/server";
import { getBackendInternalBaseUrl } from "@/lib/backend-internal-url";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await context.params;
    const { searchParams } = new URL(request.url);
    const backendUrl = `${getBackendInternalBaseUrl()}/api/v1/mist/sites/${encodeURIComponent(siteId)}/client-stats?${searchParams.toString()}`;

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Client-ID": request.headers.get("X-Client-ID") || "",
      },
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Client stats API proxy error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch client stats" },
      { status: 500 }
    );
  }
}