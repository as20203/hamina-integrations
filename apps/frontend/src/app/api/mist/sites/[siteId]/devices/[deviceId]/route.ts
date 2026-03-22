import { NextResponse } from "next/server";

const getBackendBaseUrl = (): string => {
  return process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://backend:4000";
};

export const GET = async (_req: Request, context: { params: Promise<{ siteId: string; deviceId: string }> }) => {
  try {
    const { siteId, deviceId } = await context.params;
    const response = await fetch(
      `${getBackendBaseUrl()}/api/v1/mist/sites/${encodeURIComponent(siteId)}/devices/${encodeURIComponent(deviceId)}`,
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
