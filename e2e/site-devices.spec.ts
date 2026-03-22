import { expect, test } from "@playwright/test";
import { fetchDevicesForSite, fetchFirstSite } from "./helpers/mist-api";

test.describe("Site devices", () => {
  test("shows site devices table after load", async ({ page, request }) => {
    const site = await fetchFirstSite(request);
    if (!site) {
      test.skip(true, "No Mist sites returned (check credentials, org id, or backend).");
    }

    const devices = await fetchDevicesForSite(request, site!.id);

    await page.goto(`/site/${encodeURIComponent(site!.id)}?page=1`);

    await expect(page.getByRole("heading", { name: "Site devices", level: 1 })).toBeVisible();

    await expect(page.getByText("Loading devices…")).not.toBeVisible({ timeout: 90_000 });

    if (devices.length > 0) {
      await expect(page.getByText("No devices match the current filters.")).not.toBeVisible();
      const dataRows = page.locator("tbody tr").filter({ hasNotText: "Loading devices" });
      await expect(dataRows.first()).toBeVisible();
      expect(await dataRows.count()).toBeGreaterThanOrEqual(1);
    }
  });
});
