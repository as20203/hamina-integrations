import { NextRequest, NextResponse } from "next/server";
import { getBackendInternalBaseUrl } from "@/lib/backend-internal-url";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const backendUrl = `${getBackendInternalBaseUrl()}/api/v1/mist/inventory?${searchParams.toString()}`;

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
    console.error("Inventory API proxy error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch inventory" },
      { status: 500 }
    );
  }
}