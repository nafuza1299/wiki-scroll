import { expect, test } from "@playwright/test";
import { mockWikipediaApi } from "./mockWikipedia";

/*
  Covers the year-filtered category browse end to end. feedSource.test.ts
  proves the discard logic in isolation, against a mock it controls
  completely; this proves the whole path — a real form submission driving a
  real request, whose shape and rendered result actually agree — in a real
  browser.
*/

// The shared mock returns a fixed year (2020) for every title, which can't
// discriminate a range. Registered after mockWikipediaApi, so it wins — see
// mockWikipedia.ts's own "catch-all first" note for why registration order
// decides precedence here.
async function mockVaryingCreationYears(
  page: import("@playwright/test").Page,
  years: Record<string, string>,
): Promise<void> {
  await page.route(/en\.wikipedia\.org\/w\/api\.php\?.*prop=revisions/, (route) => {
    const url = new URL(route.request().url());
    const title = url.searchParams.get("titles") ?? "";
    const timestamp = years[title] ?? "2000-01-01T00:00:00Z";
    return route.fulfill({
      json: { query: { pages: { "1": { revisions: [{ timestamp }] } } } },
    });
  });
}

test("the dedicated filter narrows a category to a creation-year range", async ({ page }) => {
  await mockWikipediaApi(page);
  await mockVaryingCreationYears(page, {
    "Physics Member 1": "1897-01-01T00:00:00Z",
    "Physics Member 2": "1932-01-01T00:00:00Z",
    "Physics Member 3": "1964-01-01T00:00:00Z",
  });

  await page.goto("/");
  await expect(page.locator("article[data-index]")).toHaveCount(10);

  await page.getByLabel("Category").fill("Physics");
  await page.getByLabel("From year").fill("1900");
  await page.getByLabel("To year").fill("1950");

  const [categoryRequest] = await Promise.all([
    page.waitForRequest((req) => req.url().includes("generator=categorymembers")),
    page.getByRole("button", { name: "Browse category" }).click(),
  ]);
  expect(categoryRequest.url()).toContain("gcmtitle=Category%3APhysics");

  await expect(page.getByText("Category: Physics (1900–1950)")).toBeVisible();
  await expect(page).toHaveURL(/[?&]cat=Physics/);
  await expect(page).toHaveURL(/[?&]yf=1900/);
  await expect(page).toHaveURL(/[?&]yt=1950/);

  // Only the one member created inside 1900-1950 — 1897 and 1964 are excluded.
  const cards = page.locator("article[data-index]");
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator("h2")).toHaveText("Physics Member 2");
  // The year-filter pass resolved createdAt itself, so the card already
  // carries it rather than waiting on the usual off-critical-path enrichment.
  await expect(cards.first()).toContainText("Created Jan 1, 1932");
});

test("the search box's Category: prefix still works, without a year range", async ({ page }) => {
  await mockWikipediaApi(page);
  await page.goto("/");
  await expect(page.locator("article[data-index]")).toHaveCount(10);

  await page.getByLabel("Search Wikipedia").fill("Category:Physics");
  await page.getByLabel("Search Wikipedia").press("Enter");

  await expect(page.getByText("Category: Physics")).toBeVisible();
  // No "(from–to)" suffix, and no year params on the URL.
  await expect(page.getByText(/Category: Physics \(/)).not.toBeVisible();
  await expect(page).not.toHaveURL(/[?&]yf=/);
  await expect(page).not.toHaveURL(/[?&]yt=/);

  // The dedicated control picks up the same seed the search box set.
  await expect(page.getByLabel("Category")).toHaveValue("Physics");
});

test("a submitted year range survives a reload", async ({ page }) => {
  await mockWikipediaApi(page);
  await mockVaryingCreationYears(page, { "Physics Member 2": "1932-01-01T00:00:00Z" });
  await page.goto("/");
  await expect(page.locator("article[data-index]")).toHaveCount(10);

  await page.getByLabel("Category").fill("Physics");
  await page.getByLabel("From year").fill("1900");
  await page.getByRole("button", { name: "Browse category" }).click();
  await expect(page.getByText("Category: Physics (1900–)")).toBeVisible();

  await page.reload();

  await expect(page.getByText("Category: Physics (1900–)")).toBeVisible();
  await expect(page.getByLabel("Category")).toHaveValue("Physics");
  await expect(page.getByLabel("From year")).toHaveValue("1900");
});

test("clearing the category filter returns to the random feed", async ({ page }) => {
  await mockWikipediaApi(page);
  await page.goto("/");
  await expect(page.locator("article[data-index]")).toHaveCount(10);

  await page.getByLabel("Category").fill("Physics");
  await page.getByLabel("From year").fill("1900");
  await page.getByRole("button", { name: "Browse category" }).click();
  await expect(page.getByText("Category: Physics")).toBeVisible();

  await page.getByRole("button", { name: "Clear category" }).click();

  await expect(page.getByText("Category: Physics", { exact: false })).not.toBeVisible();
  await expect(page).not.toHaveURL(/[?&]cat=/);
  await expect(page.getByLabel("From year")).toBeDisabled();
});
