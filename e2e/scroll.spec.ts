import { expect, test } from "@playwright/test";
import { mockWikipediaApi } from "./mockWikipedia";

/*
  This is the one thing the unit suite cannot prove: that scrolling a real
  card into view in a real browser actually starts loading the next page.
  IntersectionObserver is stubbed by hand in src/test/setup.ts for every other
  test in this repo (jsdom has none), which means the mechanism itself — not
  just the reducer it feeds — has never run before this.
*/

test("infinite scroll loads a second page of articles", async ({ page }) => {
  await mockWikipediaApi(page);
  await page.goto("/");

  const cards = page.locator("article[data-index]");
  const titles = page.locator("article[data-index] h2");
  await expect(cards).toHaveCount(10);

  // Titles only, not the whole card: view count and creation date stream in
  // asynchronously after the card renders (see feedSource.ts), so the card's
  // full text is not stable to snapshot right after paint.
  const firstPageTitles = await titles.allTextContents();

  // Scrolling the last card of the first page into view is what real infinite
  // scroll looks like — not a synthetic "load more" call.
  await cards.last().scrollIntoViewIfNeeded();

  await expect(cards).toHaveCount(20, { timeout: 10_000 });

  const secondPageTitles = await titles.allTextContents();
  // The new cards are genuinely new content, not a re-render of the first page.
  expect(secondPageTitles.slice(0, 10)).toEqual(firstPageTitles);
  expect(new Set(secondPageTitles).size).toBe(20);
});

test("j/k keyboard navigation also crosses the page boundary", async ({ page }) => {
  await mockWikipediaApi(page);
  await page.goto("/");

  const cards = page.locator("article[data-index]");
  await expect(cards).toHaveCount(10);

  // PREFETCH_AHEAD triggers the next page once the active card is within 3 of
  // the end — index 7 of 0..9 crosses that line.
  for (let i = 0; i < 8; i += 1) await page.keyboard.press("j");

  await expect(cards).toHaveCount(20, { timeout: 10_000 });
});
