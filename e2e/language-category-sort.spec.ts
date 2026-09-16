import { expect, test } from "@playwright/test";
import { mockWikipediaApi } from "./mockWikipedia";

/*
  Covers the three things the unit suite proves in isolation but never proves
  wired together in a real browser: picking a language actually redirects
  every subsequent request to that wiki's host, typing "Category:X" actually
  drives a categorymembers request instead of a literal-string search, and
  the sort control actually changes the outgoing search request rather than
  just the local UI state.
*/

test("switching language redirects requests to that wiki", async ({ page }) => {
  await mockWikipediaApi(page, { lang: "en" });
  await mockWikipediaApi(page, { lang: "fr" });
  await page.goto("/");

  await expect(page.locator("article[data-index]")).toHaveCount(10);

  const [frRequest] = await Promise.all([
    page.waitForRequest((req) => req.url().includes("fr.wikipedia.org")),
    page.getByLabel("Wikipedia language").selectOption("fr"),
  ]);

  expect(frRequest.url()).toContain("fr.wikipedia.org");
  await expect(page).toHaveURL(/[?&]lang=fr/);
  // The feed resets and repaints against the new language rather than
  // silently keeping the old language's cards on screen.
  await expect(page.locator("article[data-index]")).toHaveCount(10);
});

test("typing a Category: seed browses that category instead of searching for it", async ({
  page,
}) => {
  await mockWikipediaApi(page);
  await page.goto("/");
  await expect(page.locator("article[data-index]")).toHaveCount(10);

  const [categoryRequest] = await Promise.all([
    page.waitForRequest((req) => req.url().includes("generator=categorymembers")),
    (async () => {
      await page.getByLabel("Search Wikipedia").fill("Category:Physics");
      await page.getByLabel("Search Wikipedia").press("Enter");
    })(),
  ]);

  expect(categoryRequest.url()).toContain("gcmtitle=Category%3APhysics");
  await expect(page.getByText("Category: Physics")).toBeVisible();
  await expect(page.locator("article[data-index] h2").first()).toHaveText("Physics Member 1");

  // Back to random clears the category seed, same as it does for a search.
  await page.getByRole("button", { name: "Back to random" }).click();
  await expect(page.getByText("Category: Physics")).not.toBeVisible();
  await expect(page).not.toHaveURL(/[?&]cat=/);
});

test("choosing a sort order changes the outgoing search request and the URL", async ({ page }) => {
  await mockWikipediaApi(page);
  await page.goto("/");
  await expect(page.locator("article[data-index]")).toHaveCount(10);

  await page.getByLabel("Search Wikipedia").fill("Cats");
  await page.getByLabel("Search Wikipedia").press("Enter");
  await expect(page.getByText("Results for “Cats”")).toBeVisible();

  const sortControl = page.getByLabel("Sort search results");
  await expect(sortControl).toBeVisible();

  const [sortedRequest] = await Promise.all([
    page.waitForRequest((req) => req.url().includes("list=search") && req.url().includes("srsort")),
    sortControl.selectOption("recent"),
  ]);

  expect(sortedRequest.url()).toContain("srsort=last_edit_desc");
  await expect(page).toHaveURL(/[?&]sort=recent/);

  // The sort control only ever appears for an actual text search.
  await page.getByRole("button", { name: "Back to random" }).click();
  await expect(sortControl).not.toBeVisible();
});
