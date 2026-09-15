import type { Page } from "@playwright/test";

/*
  Routes every Wikimedia call to canned, deterministic responses instead of the
  live API. Same reasoning as src/test/fetchMock.ts, one level up: a browser
  E2E suite that depended on the real API would be flaky under Wikipedia's own
  rate limits and would break every time an article's content changed — for a
  suite whose whole point is exercising *our* code (infinite scroll, the
  reader, focus handling), not Wikipedia's.

  Routes are registered catch-all-first: Playwright runs the most recently
  registered matching handler first, so the specific routes below take
  priority and anything unanticipated falls through to the catch-all instead
  of hanging on a real network request that this sandbox can't make anyway.
*/

// A 1x1 transparent PNG — enough for <img> to have something real to paint.
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export function summaryFixture(id: number): Record<string, unknown> {
  return {
    type: "standard",
    pageid: id,
    title: `E2E Article ${id}`,
    extract: `Extract for E2E Article ${id}. A short description of a fictional article used only in end-to-end tests.`,
    thumbnail: { source: `https://upload.wikimedia.org/e2e-thumb-${id}.png` },
    content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/E2E_Article_${id}` } },
    timestamp: "2026-01-01T00:00:00Z",
  };
}

export interface MockOptions {
  /** How many distinct random summaries to hand out before repeating. Default: plenty for two pages. */
  poolSize?: number;
}

/** Installs the mocks. Call before page.goto(). */
export async function mockWikipediaApi(page: Page, options: MockOptions = {}): Promise<void> {
  const poolSize = options.poolSize ?? 100;

  // Catch-all, registered first so specific routes below take priority. Aborts
  // rather than hangs, and warns loudly — the app treats a failed request as an
  // ordinary error state, so an unmocked call fails the test's own assertions
  // rather than throwing; this warning is what tells you why.
  for (const host of ["https://en.wikipedia.org/**", "https://wikimedia.org/**"]) {
    await page.route(host, (route) => {
      console.warn(`e2e: unmocked Wikimedia request — ${route.request().url()}`);
      return route.abort();
    });
  }

  let nextId = 1;
  await page.route("https://en.wikipedia.org/api/rest_v1/page/random/summary", (route) => {
    const id = ((nextId - 1) % poolSize) + 1;
    nextId += 1;
    return route.fulfill({ json: summaryFixture(id) });
  });

  await page.route(/wikimedia\.org\/api\/rest_v1\/metrics\/pageviews\//, (route) =>
    route.fulfill({ json: { items: [{ views: 128 }] } }),
  );

  await page.route(/en\.wikipedia\.org\/w\/api\.php\?.*prop=revisions/, (route) =>
    route.fulfill({
      json: { query: { pages: { "1": { revisions: [{ timestamp: "2020-06-15T00:00:00Z" }] } } } },
    }),
  );

  await page.route("https://en.wikipedia.org/api/rest_v1/page/mobile-html/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body><p>Mocked article body, used only in end-to-end tests.</p></body></html>",
    }),
  );

  await page.route("https://upload.wikimedia.org/**", (route) =>
    route.fulfill({ contentType: "image/png", body: PIXEL_PNG }),
  );
}
