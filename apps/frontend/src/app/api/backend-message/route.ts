import { NextResponse } from "next/server";

const getBackendBaseUrl = (): string => {
  return process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://backend:4000";
};

export const GET = async () => {
  try {
    const response = await fetch(`${getBackendBaseUrl()}/`, { cache: "no-store" });
    const data = (await response.json()) as { message?: string };
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ message: `Backend not reachable: ${message}` }, { status: 502 });
  }
};
