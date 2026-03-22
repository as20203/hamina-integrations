import { NextResponse } from "next/server";
import { getBackendInternalBaseUrl } from "@/lib/backend-internal-url";

export const GET = async (_req: Request, context: { params: Promise<{ siteId: string }> }) => {
  try {
    const { siteId } = await context.params;
    const response = await fetch(
      `${getBackendInternalBaseUrl()}/api/v1/mist/sites/${encodeURIComponent(siteId)}/site-summary`,
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
