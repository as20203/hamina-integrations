import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://localhost:4000";

export async function GET(
  request: NextRequest,
  { params }: { params: { siteId: string } }
) {
  try {
    const { siteId } = params;
    const { searchParams } = new URL(request.url);
    const backendUrl = `${BACKEND_URL}/api/v1/mist/sites/${siteId}/client-stats?${searchParams.toString()}`;

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