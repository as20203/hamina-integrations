import { SitesOverview } from "@/components/sites/sites-overview";
import { Suspense } from "react";

const SitesPage = () => {
  return (
    <Suspense fallback={<div className="py-8 text-sm text-muted-foreground">Loading sites…</div>}>
      <SitesOverview />
    </Suspense>
  );
};

export default SitesPage;
