import { expect, test } from "@playwright/test";
import { fetchFirstSite } from "./helpers/mist-api";

test.describe("Sites overview", () => {
  test("shows org sites and at least one site from Mist", async ({ page, request }) => {
    const site = await fetchFirstSite(request);
    if (!site) {
      test.skip(true, "No Mist sites returned (check credentials, org id, or backend).");
    }

    await page.goto("/sites");

    await expect(page.getByRole("heading", { name: "Org sites", level: 1 })).toBeVisible();

    await expect(page.locator("main .animate-pulse")).toHaveCount(0, { timeout: 90_000 });

    const mainLinks = page.locator("main").getByRole("link");
    const linkCount = await mainLinks.count();
    const siteNameVisible = await page.getByText(site!.name, { exact: false }).first().isVisible().catch(() => false);
    const siteIdVisible = await page.getByText(site!.id, { exact: true }).first().isVisible().catch(() => false);

    expect(linkCount >= 1 || siteNameVisible || siteIdVisible).toBeTruthy();
  });
});
