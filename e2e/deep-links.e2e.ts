import { expect, test } from "@playwright/test";
import { installRoutes } from "./routes";

/*
  The URL as the source of truth.

  routes.test.ts covers parse/serialize round-tripping, which is the pure half.
  The half that breaks in practice is the interaction with history: pushState
  does not fire popstate, so a navigation that forgets to dispatch leaves the app
  and the address bar disagreeing, and Back stops closing the reader.

  The cold-start case is why ArticleReader takes a title rather than an Article.
  A shared ?article= link arrives with an empty feed behind it, so there is no
  card to read the data from.
*/
test.describe("deep links", () => {
  test("a cold ?article= link opens the reader with no feed behind it", async ({ page }) => {
    await installRoutes(page);

    await page.goto("/?article=Fixture%20Target");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Fixture Target" })).toBeVisible();
    await expect(page.locator(".wiki-article")).toContainText(
      "Legitimate paragraph text that must survive sanitisation",
    );
  });

  test("Back closes the reader and cleans the URL", async ({ page }) => {
    await installRoutes(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Fixture Alpha" })).toBeVisible();

    await page.getByRole("button", { name: "Fixture Alpha", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("article")).toBe("Fixture Alpha");

    // Opening pushes rather than replaces, so hardware Back does what an Android
    // user expects: close the thing that just opened.
    await page.goBack();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("article")).toBeNull();
    await expect(page.getByRole("heading", { name: "Fixture Alpha" })).toBeVisible();
  });

  test("a search seeds the feed from ?q= and survives a reload", async ({ page }) => {
    await installRoutes(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Fixture Alpha" })).toBeVisible();

    const search = page.getByLabel("Search Wikipedia");
    await search.fill("volcanoes");
    await search.press("Enter");

    await expect(page.getByRole("heading", { name: "Search Hit One" })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("q")).toBe("volcanoes");

    // The URL drives the feed rather than merely recording it, so a reload has
    // to land back on the same results.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Search Hit One" })).toBeVisible();
    await expect(page.getByLabel("Search Wikipedia")).toHaveValue("volcanoes");
  });

  test("?view=saved opens the saved list directly", async ({ page }) => {
    await installRoutes(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Fixture Alpha" })).toBeVisible();

    await page.getByRole("button", { name: "Save Fixture Alpha" }).click();
    await expect(page.getByRole("button", { name: /^Saved/ })).toHaveText("Saved (1)");

    await page.goto("/?view=saved");

    // Saved articles are stored whole, not as ids, so this list paints without
    // a single request behind it.
    await expect(page.getByRole("heading", { name: "Fixture Alpha" })).toBeVisible();
    await expect(page.getByLabel("Search Wikipedia")).toHaveCount(0);
  });

  test("an unreadable article still leaves the reader recoverable", async ({ page }) => {
    const routes = await installRoutes(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Fixture Alpha" })).toBeVisible();

    routes.offline = true;
    await page.getByRole("button", { name: "Fixture Alpha", exact: true }).click();

    // A dead fetch inside the dialog must not strand the user in it: the reader
    // reports the failure, and Escape still gets them out.
    await expect(page.getByRole("dialog")).toContainText("Couldn't load the article");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
