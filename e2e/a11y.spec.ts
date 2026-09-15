import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mockWikipediaApi } from "./mockWikipedia";

/*
  eslint-plugin-vuejs-accessibility catches static markup mistakes, but it
  cannot see the live DOM — a focus trap that leaks, a live region that never
  actually gets a busy widget inside it, contrast against the real computed
  theme. This runs an axe scan against the rendered app instead, once on the
  feed and once with the reader modal (the one place the app injects
  third-party HTML) open — in both themes, explicitly set rather than left to
  the browser's default `prefers-color-scheme`. This is what first caught
  src/styles/tokens.css's light-mode `--color-text-muted`, which measured
  4.41:1 against the reader footer's background — under the 4.5:1 AA floor —
  even though the same colors pass on paper; axe samples actual rendered
  pixels, anti-aliasing included, which paper arithmetic does not.

  "critical" and "serious" violations fail the test; "moderate"/"minor" are
  reported but not enforced, so a low-confidence audit rule doesn't gate CI
  the way an actually broken interaction should.
*/

function severe(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript((t) => localStorage.setItem("wiki-scroll:theme", t), theme);
}

for (const theme of ["light", "dark"] as const) {
  test(`the feed has no serious accessibility violations (${theme})`, async ({ page }) => {
    await setTheme(page, theme);
    await mockWikipediaApi(page);
    await page.goto("/");
    await expect(page.locator("article[data-index]")).toHaveCount(10);

    const results = await new AxeBuilder({ page }).analyze();
    const found = severe(results.violations);
    expect(found, JSON.stringify(found, null, 2)).toEqual([]);
  });

  test(`the open reader has no serious accessibility violations (${theme})`, async ({ page }) => {
    await setTheme(page, theme);
    await mockWikipediaApi(page);
    await page.goto("/");
    await expect(page.locator("article[data-index]")).toHaveCount(10);

    await page.getByRole("button", { name: "E2E Article 1", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // Let the mocked article body replace the loading skeletons before scanning.
    await expect(page.getByText("Mocked article body")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const found = severe(results.violations);
    expect(found, JSON.stringify(found, null, 2)).toEqual([]);
  });
}
