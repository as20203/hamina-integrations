import { MistDevicePage } from "./mist-device-page";
import { Suspense } from "react";

const DeviceRoutePage = () => {
  return (
    <Suspense fallback={<div className="py-8 text-sm text-muted-foreground">Loading device…</div>}>
      <MistDevicePage />
    </Suspense>
  );
};

export default DeviceRoutePage;
