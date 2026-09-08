import { expect, test } from "@playwright/test";
import { installRoutes } from "./routes";

/*
  What useFeedKeyboard.test.ts cannot reach.

  That file asserts the handlers fire, which is the right unit-level question. It
  cannot answer the one that decides whether j/k are usable: does the focus ring
  actually move? step() calls focus({ preventScroll: true }) and then
  scrollIntoView, and under jsdom neither does anything observable — so the whole
  reason the shortcut moves DOM focus rather than just an index (a screen-reader
  user otherwise gets no announcement at all) is untested there.
*/

async function focusedCardIndex(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(
    () =>
      document.activeElement?.closest("article[data-index]")?.getAttribute("data-index") ?? null,
  );
}

test.describe("feed keyboard shortcuts", () => {
  test.beforeEach(async ({ page }) => {
    await installRoutes(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Fixture Alpha" })).toBeVisible();
  });

  test("j and k move real DOM focus, not just an index", async ({ page }) => {
    /*
      Relative, not absolute. activeIndex is not 0 on arrival: the
      IntersectionObserver runs during the first paint and sets it to whichever
      card is on screen, which depends on the viewport. Asserting a starting
      index would make this a test of the window size.
    */
    await page.keyboard.press("j");
    const first = Number(await focusedCardIndex(page));
    expect(Number.isNaN(first)).toBe(false);

    await page.keyboard.press("j");
    expect(Number(await focusedCardIndex(page))).toBe(first + 1);

    await page.keyboard.press("k");
    expect(Number(await focusedCardIndex(page))).toBe(first);
  });

  test("k clamps at the first card instead of wrapping", async ({ page }) => {
    for (let i = 0; i < 12; i += 1) await page.keyboard.press("k");
    expect(await focusedCardIndex(page)).toBe("0");

    // A wrap here would jump to the end of a feed that is still growing.
    await page.keyboard.press("k");
    expect(await focusedCardIndex(page)).toBe("0");
  });

  test("Enter opens the focused article", async ({ page }) => {
    for (let i = 0; i < 12; i += 1) await page.keyboard.press("k");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("dialog")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("article")).toBe("Fixture Alpha");
  });

  test("typing in the search box does not trigger shortcuts", async ({ page }) => {
    // Labelled, not by role: an <input type="search"> carrying a `list`
    // attribute maps to combobox rather than searchbox.
    const search = page.getByLabel("Search Wikipedia");
    await search.click();
    await search.pressSequentially("jsok");

    // Every one of those characters is bound: j/k step, s saves, o opens. In a
    // text field they must be text — this is the guard that makes the search box
    // usable at all.
    await expect(search).toHaveValue("jsok");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Saved/ })).toHaveText("Saved");
  });

  test("s saves the focused article and the header count follows", async ({ page }) => {
    await page.keyboard.press("j");
    await page.keyboard.press("s");

    await expect(page.getByRole("button", { name: /^Saved/ })).toHaveText("Saved (1)");

    await page.keyboard.press("s");
    await expect(page.getByRole("button", { name: /^Saved/ })).toHaveText("Saved");
  });

  test("? opens the shortcut list and Escape closes it", async ({ page }) => {
    await page.keyboard.press("?");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Keyboard shortcuts");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("arrow keys still scroll the page", async ({ page }) => {
    /*
      Deliberately not bound, and worth a test because binding them is the
      obvious thing to do. Arrows are a keyboard user's only way to scroll, so
      taking them costs more than j/k add.
    */
    // From a focused card, which is where a keyboard user actually is: the app
    // scrolls an inner container, and arrows move whichever scroller holds focus.
    await page.keyboard.press("j");
    const scrollTop = () =>
      page.evaluate(() => document.querySelector(".overflow-y-auto")?.scrollTop ?? 0);
    const before = await scrollTop();

    for (let i = 0; i < 5; i += 1) await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);

    expect(await scrollTop()).toBeGreaterThan(before);
  });
});
