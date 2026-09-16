import { expect, test } from "@playwright/test";
import { installRoutes } from "./routes";

/*
  The regression this whole rewrite exists for.

  Before it, a failed first load had no representation at all: fetchBatch was a
  Promise.all with no .catch(), so one rejection emptied the batch, `articles`
  stayed [], and the skeleton rendered forever with the reason visible only as an
  unhandled rejection in the console. The unit tests cover the reducer's half of
  the fix. This covers what the user actually meets.
*/
test.describe("a failed first load", () => {
  test("shows an error with a working retry instead of an endless skeleton", async ({ page }) => {
    const routes = await installRoutes(page, { offline: true });

    await page.goto("/");

    // role="alert" rather than a heading: Notice announces assertively, which is
    // the behaviour worth pinning — a silent error panel is barely better than none.
    const error = page.getByRole("alert").filter({ hasText: "Couldn't load articles" });
    await expect(error).toBeVisible();

    // The half that actually regressed. An error panel that appears *beside* a
    // still-spinning skeleton would pass a naive assertion while looking broken.
    await expect(page.getByLabel("Loading articles")).toHaveCount(0);

    // Reachable without a mouse: the old failure mode left nothing to focus at all.
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible();
    await retry.focus();
    await expect(retry).toBeFocused();

    routes.offline = false;
    await retry.press("Enter");

    await expect(page.getByRole("heading", { name: "Fixture Alpha" })).toBeVisible();
    await expect(error).toHaveCount(0);
  });

  test("a failed second page keeps the articles already loaded", async ({ page }) => {
    const routes = await installRoutes(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Fixture Alpha" })).toBeVisible();

    const loaded = await page.locator("article[data-index]").count();
    expect(loaded).toBeGreaterThan(0);

    routes.offline = true;
    await page.mouse.wheel(0, 20_000);

    // Whatever the next page does, the pages already on screen stay. Losing them
    // is the failure mode: it turns a partial outage into a blank feed.
    await expect(page.locator("article[data-index]")).toHaveCount(loaded);
  });
});
