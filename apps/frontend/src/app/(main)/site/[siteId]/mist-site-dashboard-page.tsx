"use client";

import { MistDashboard } from "@/components/mist/mist-dashboard";
import { useParams } from "next/navigation";

const MistSiteDashboardPage = () => {
  const params = useParams<{ siteId: string }>();
  const siteId = decodeURIComponent(params.siteId ?? "").trim();

  if (!siteId) {
    return <div className="text-sm text-destructive">Missing site id.</div>;
  }

  return <MistDashboard siteId={siteId} />;
};

export { MistSiteDashboardPage };
