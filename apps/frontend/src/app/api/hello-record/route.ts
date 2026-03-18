import { NextRequest, NextResponse } from "next/server";

const getBackendBaseUrl = (): string => {
  return process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://backend:4000";
};

export const POST = async (request: NextRequest) => {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const response = await fetch(`${getBackendBaseUrl()}/api/hello-record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = (await response.json()) as unknown;
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
};
