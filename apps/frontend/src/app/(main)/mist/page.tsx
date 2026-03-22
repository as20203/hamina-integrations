import { MistDashboard } from "@/components/mist/mist-dashboard";
import { Suspense } from "react";

const MistPage = () => {
  return (
    <Suspense fallback={<div className="py-8 text-sm text-muted-foreground">Loading dashboard…</div>}>
      <MistDashboard />
    </Suspense>
  );
};

export default MistPage;
