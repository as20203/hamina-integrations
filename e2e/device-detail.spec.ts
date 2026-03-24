import { expect, test } from "@playwright/test";
import { fetchDevicesForSite } from "./helpers/mist-api";

/** Default site used to resolve a sample device from the BFF devices list (Mist `/stats/devices` behind the API). */
const DEFAULT_DEVICE_DETAIL_SITE_ID = "f339c0ca-e5c1-4e23-aed6-faf193307202";

const deviceDetailSiteId = () => {
  const fromEnv = process.env.PLAYWRIGHT_E2E_SITE_ID?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_DEVICE_DETAIL_SITE_ID;
};

test.describe("Device detail", () => {
  test("loads site device table then shows a sample device by name", async ({ page, request }) => {
    const siteId = deviceDetailSiteId();

    await page.goto(`/site/${encodeURIComponent(siteId)}?page=1`);

    await expect(page.getByRole("heading", { name: "Site devices", level: 1 })).toBeVisible();

    await expect(page.getByText("Loading devices…")).not.toBeVisible({ timeout: 90_000 });

    const devices = await fetchDevicesForSite(request, siteId);
    if (devices.length === 0) {
      test.skip(
        true,
        `No devices for site ${siteId} (org/site mismatch or API error). Override with PLAYWRIGHT_E2E_SITE_ID.`
      );
    }

    const device = devices[0];

    await page.goto(
      `/site/${encodeURIComponent(siteId)}/devices/${encodeURIComponent(device.id)}`
    );

    await expect(page.locator("main div.animate-pulse")).toHaveCount(0, { timeout: 90_000 });

    await expect(page.getByRole("heading", { name: device.name, level: 1 })).toBeVisible();
  });
});
