import { expect, test } from "@playwright/test";
import { installRoutes } from "./routes";

/*
  The focus trap, under a browser that actually implements Tab.

  Modal.test.ts drives this under jsdom, where Tab does not move focus at all —
  the test has to simulate the wrap it is checking for, which means it verifies
  the trap's arithmetic rather than its effect. Everything below is the effect.

  It is also the reason the reader is not an iframe. Modal's focusable selector
  does not match `iframe`, so once focus enters a frame the first/last comparison
  never matches again and Tab walks the user out of the dialog through hundreds
  of article links. Injecting sanitised HTML keeps every focusable node inside
  the panel, where the trap can see it — which these tests are what prove.
*/

async function focusIsInsideDialog(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
}

test.describe("the reader modal", () => {
  test.beforeEach(async ({ page }) => {
    await installRoutes(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Fixture Alpha" })).toBeVisible();
  });

  test("keeps Tab inside the panel", async ({ page }) => {
    await page.getByRole("button", { name: "Fixture Alpha", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator(".wiki-article")).toBeVisible();

    // More presses than the panel has focusable nodes, so this fails if the trap
    // leaks anywhere in the cycle rather than only at the boundary.
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press("Tab");
      expect(await focusIsInsideDialog(page)).toBe(true);
    }

    // Shift+Tab has to wrap too — a trap that only holds forwards is half a trap.
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press("Shift+Tab");
      expect(await focusIsInsideDialog(page)).toBe(true);
    }
  });

  test("returns focus to the control that opened it", async ({ page }) => {
    const opener = page.getByRole("button", { name: "Fixture Alpha", exact: true });
    await opener.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Without this a keyboard user lands back at the top of the document and has
    // to tab all the way down to where they were.
    await expect(opener).toBeFocused();
  });

  test("restores page scrolling when it closes", async ({ page }) => {
    const bodyOverflow = () => page.evaluate(() => document.body.style.overflow);

    await page.getByRole("button", { name: "Fixture Alpha", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await bodyOverflow()).toBe("hidden");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // A scroll lock that is not released leaves the whole app frozen, which
    // looks like a hang rather than a bug.
    expect(await bodyOverflow()).not.toBe("hidden");
  });

  test("the shortcuts dialog traps focus too", async ({ page }) => {
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog")).toBeVisible();

    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab");
      expect(await focusIsInsideDialog(page)).toBe(true);
    }
  });
});
