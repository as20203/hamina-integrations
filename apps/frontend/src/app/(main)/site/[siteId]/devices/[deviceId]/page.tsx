import { MistSiteDevicePage } from "./mist-site-device-page";
import { Suspense } from "react";

const SiteDeviceRoutePage = () => {
  return (
    <Suspense fallback={<div className="py-8 text-sm text-muted-foreground">Loading device…</div>}>
      <MistSiteDevicePage />
    </Suspense>
  );
};

export default SiteDeviceRoutePage;
