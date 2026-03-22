import { MistSiteDashboardPage } from "./mist-site-dashboard-page";
import { Suspense } from "react";

const SiteDashboardRoutePage = () => {
  return (
    <Suspense fallback={<div className="py-8 text-sm text-muted-foreground">Loading dashboard…</div>}>
      <MistSiteDashboardPage />
    </Suspense>
  );
};

export default SiteDashboardRoutePage;
