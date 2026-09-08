import { expect, test } from "@playwright/test";
import { installRoutes, pwnedMarker } from "./routes";

/*
  The sanitiser against real attacks, on the real path.

  src/lib/sanitizeArticleHtml.test.ts has 31 tests, and they all assert on the
  string the function returns. That leaves one step untested and it is the step
  that matters: what happens when that string is mounted into a live document.
  A payload that survives as inert text in a returned string and executes once
  parsed by the browser would pass every one of those tests.

  So the fixture here is fetched over the network, sanitised, and injected by the
  app itself — no shortcuts — and each payload writes a distinct value to
  window.__pwned so a failure names the defence that gave way.
*/
test.describe("the in-app reader", () => {
  test.beforeEach(async ({ page }) => {
    await installRoutes(page);
    await page.goto("/");
    // exact: the save and share controls are labelled "Save Fixture Alpha" and
    // "Share Fixture Alpha", so a substring match hits three buttons.
    await page.getByRole("button", { name: "Fixture Alpha", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator(".wiki-article")).toBeVisible();
  });

  test("executes nothing from the article HTML", async ({ page }) => {
    // Give anything that was going to fire a chance to fire.
    await page.waitForTimeout(300);
    expect(await pwnedMarker(page)).toBeUndefined();
  });

  test("strips executable and framing elements from the rendered DOM", async ({ page }) => {
    const article = page.locator(".wiki-article");

    for (const tag of ["script", "iframe", "object", "embed", "form", "input", "svg", "base"]) {
      await expect(article.locator(tag)).toHaveCount(0);
    }
  });

  test("drops every event handler and inline style", async ({ page }) => {
    const leaked = await page.evaluate(() => {
      const root = document.querySelector(".wiki-article");
      if (!root) return ["no article rendered"];

      const found: string[] = [];
      for (const element of root.querySelectorAll("*")) {
        for (const attribute of element.attributes) {
          const name = attribute.name.toLowerCase();
          // Inline style is not cosmetic paranoia: position:fixed over the
          // viewport is a clickjacking surface, and it also fights the theme.
          if (name.startsWith("on") || name === "style") {
            found.push(`${element.tagName.toLowerCase()}[${name}]`);
          }
        }
      }
      return found;
    });

    expect(leaked).toEqual([]);
  });

  test("keeps no javascript: URL, and rewrites wiki links to stay in the app", async ({ page }) => {
    const links = await page.evaluate(() =>
      [...document.querySelectorAll(".wiki-article a")].map((anchor) => ({
        href: anchor.getAttribute("href") ?? "",
        wikiTitle: anchor.getAttribute("data-wiki-title"),
        rel: anchor.getAttribute("rel") ?? "",
      })),
    );

    expect(links.some((link) => link.href.toLowerCase().startsWith("javascript:"))).toBe(false);

    // The internal link became an in-app navigation target rather than a page load.
    expect(links.some((link) => link.wikiTitle === "Fixture Target")).toBe(true);

    // And the external one cannot reach back through window.opener.
    const external = links.find((link) => link.href.startsWith("https://example.com"));
    expect(external?.rel).toContain("noopener");
  });

  test("still renders the article around the payloads", async ({ page }) => {
    const article = page.locator(".wiki-article");

    // The check that stops every assertion above from passing on empty output:
    // a sanitiser that returned "" would satisfy all of them.
    await expect(article).toContainText("Legitimate paragraph text that must survive sanitisation");
    await expect(article).toContainText("A second legitimate paragraph, after the payloads");
    await expect(article.locator("h2, h3")).not.toHaveCount(0);
    await expect(article.locator("li")).toHaveCount(2);
  });

  test("carries the CC BY-SA attribution the iframe used to provide", async ({ page }) => {
    // Rendering the text outside Wikipedia's own chrome moves a licence
    // obligation onto this app. It is not decoration, so it is tested.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("link", { name: "CC BY-SA 4.0" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Authors" })).toHaveAttribute(
      "href",
      /action=history/,
    );
  });
});
