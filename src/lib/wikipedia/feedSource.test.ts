import { afterEach, describe, expect, it } from "vitest";
import {
  enrichArticle,
  loadRandomPage,
  loadRelatedPage,
  loadSearchPage,
  suggestTitles,
} from "./feedSource";
import { clearHttpCaches } from "../http";
import { errorResponse, fetchCalls, jsonResponse, mockRoute } from "../../test/fetchMock";
import type { RestSummary } from "./types";

afterEach(() => clearHttpCaches());

function summary(id: number, overrides: Partial<RestSummary> = {}): RestSummary {
  return {
    type: "standard",
    pageid: id,
    title: `Article ${id}`,
    extract: "An extract.",
    content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/Article_${id}` } },
    timestamp: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Serves a different article per call, as the real random endpoint does. */
function serveRandomSequence(items: Array<RestSummary | "reject">): void {
  let index = 0;
  mockRoute("/page/random/summary", () => {
    const item = items[Math.min(index, items.length - 1)];
    index += 1;
    if (item === "reject") return errorResponse(500);
    return jsonResponse(item);
  });
}

describe("loadRandomPage", () => {
  it("returns a full page of distinct articles", async () => {
    serveRandomSequence(Array.from({ length: 20 }, (_, i) => summary(i + 1)));

    const page = await loadRandomPage({ size: 5, signal: new AbortController().signal });

    expect(page.articles).toHaveLength(5);
    expect(new Set(page.articles.map((a) => a.id)).size).toBe(5);
  });

  /*
    The core of the permanent-skeleton bug lived here. Promise.all meant one
    article exhausting its retries rejected the whole batch, so a single bad
    draw took the entire feed down.
  */
  it("keeps the page when some articles fail", async () => {
    serveRandomSequence([
      summary(1),
      "reject",
      summary(2),
      "reject",
      summary(3),
      summary(4),
      summary(5),
      summary(6),
    ]);

    const page = await loadRandomPage({ size: 4, signal: new AbortController().signal });

    expect(page.articles.length).toBeGreaterThan(0);
  });

  it("discards disambiguation pages rather than showing them", async () => {
    serveRandomSequence([
      summary(1, { type: "disambiguation" }),
      summary(2, { type: "mainpage" }),
      summary(3),
      summary(4),
      summary(5),
    ]);

    const page = await loadRandomPage({ size: 2, signal: new AbortController().signal });

    expect(page.articles.every((a) => a.id >= 3)).toBe(true);
    expect(page.discarded).toBeGreaterThan(0);
  });

  it("never repeats an article already in the feed", async () => {
    serveRandomSequence([summary(1), summary(1), summary(2), summary(3), summary(4), summary(5)]);

    const page = await loadRandomPage({
      size: 3,
      signal: new AbortController().signal,
      exclude: (id) => id === 1,
    });

    expect(page.articles.map((a) => a.id)).not.toContain(1);
  });

  it("throws only when nothing at all could be loaded", async () => {
    serveRandomSequence(["reject"]);

    await expect(loadRandomPage({ size: 3, signal: new AbortController().signal })).rejects.toThrow(
      /Could not reach Wikipedia/,
    );
  });

  it("throws when every draw was unusable", async () => {
    serveRandomSequence([summary(1, { type: "disambiguation" })]);

    await expect(loadRandomPage({ size: 3, signal: new AbortController().signal })).rejects.toThrow(
      /no usable articles/,
    );
  });

  it("does not share one random result across the batch", async () => {
    serveRandomSequence(Array.from({ length: 20 }, (_, i) => summary(i + 1)));

    await loadRandomPage({ size: 4, signal: new AbortController().signal });

    // Over-fetches on purpose so filtering still yields a full page.
    expect(fetchCalls().length).toBeGreaterThanOrEqual(4);
  });
});

describe("loadSearchPage", () => {
  function serveSearch(titles: string[], nextOffset?: number): void {
    mockRoute("list=search", () =>
      jsonResponse({
        query: { search: titles.map((title, i) => ({ pageid: 100 + i, title })) },
        ...(nextOffset === undefined ? {} : { continue: { sroffset: nextOffset } }),
      }),
    );
    mockRoute("/page/summary/", ({ url }) => {
      const title = decodeURIComponent(url.split("/page/summary/")[1] ?? "");
      return jsonResponse({ ...summary(100 + titles.indexOf(title.replace(/_/g, " "))), title });
    });
  }

  it("resolves search hits to full articles", async () => {
    serveSearch(["Cat", "Dog"]);

    const page = await loadSearchPage({
      query: "pets",
      size: 10,
      offset: 0,
      signal: new AbortController().signal,
    });

    expect(page.articles.map((a) => a.title)).toEqual(["Cat", "Dog"]);
  });

  it("reports exhaustion when the API offers no continuation", async () => {
    serveSearch(["Cat"]);

    const page = await loadSearchPage({
      query: "pets",
      size: 10,
      offset: 0,
      signal: new AbortController().signal,
    });

    expect(page.exhausted).toBe(true);
    expect(page.nextOffset).toBeUndefined();
  });

  it("passes the continuation offset through", async () => {
    serveSearch(["Cat"], 10);

    const page = await loadSearchPage({
      query: "pets",
      size: 10,
      offset: 0,
      signal: new AbortController().signal,
    });

    expect(page.exhausted).toBe(false);
    expect(page.nextOffset).toBe(10);
  });

  /*
    An empty search is a successful answer, not a failure — the feed shows "no
    matches" rather than an error.
  */
  it("returns an empty, exhausted page for a query with no hits", async () => {
    mockRoute("list=search", () => jsonResponse({ query: { search: [] } }));

    const page = await loadSearchPage({
      query: "zzzz",
      size: 10,
      offset: 0,
      signal: new AbortController().signal,
    });

    expect(page.articles).toEqual([]);
    expect(page.exhausted).toBe(true);
  });

  it("keeps the hits whose summaries resolved", async () => {
    mockRoute("list=search", () =>
      jsonResponse({
        query: {
          search: [
            { pageid: 1, title: "Good" },
            { pageid: 2, title: "Bad" },
          ],
        },
      }),
    );
    mockRoute("/page/summary/", ({ url }) =>
      url.includes("Bad") ? errorResponse(404) : jsonResponse({ ...summary(1), title: "Good" }),
    );

    const page = await loadSearchPage({
      query: "x",
      size: 10,
      offset: 0,
      signal: new AbortController().signal,
    });

    expect(page.articles.map((a) => a.title)).toEqual(["Good"]);
  });
});

describe("loadRelatedPage", () => {
  it("returns everything related in one request and stops", async () => {
    mockRoute("/page/related/", () => jsonResponse({ pages: [summary(1), summary(2)] }));

    const page = await loadRelatedPage({
      title: "Cat",
      size: 10,
      signal: new AbortController().signal,
    });

    expect(page.articles.map((a) => a.id)).toEqual([1, 2]);
    expect(page.exhausted).toBe(true);
  });

  it("survives a response with no related pages", async () => {
    mockRoute("/page/related/", () => jsonResponse({}));

    const page = await loadRelatedPage({
      title: "Cat",
      size: 10,
      signal: new AbortController().signal,
    });

    expect(page.articles).toEqual([]);
  });
});

describe("suggestTitles", () => {
  it("reads titles out of the positional opensearch response", async () => {
    mockRoute("action=opensearch", () =>
      jsonResponse(["mar", ["Marie Curie", "Mars"], ["", ""], ["", ""]]),
    );

    await expect(suggestTitles("mar", new AbortController().signal)).resolves.toEqual([
      "Marie Curie",
      "Mars",
    ]);
  });

  /*
    Suggestions are optional. A failure here must not interrupt typing, so this
    swallows rather than propagating.
  */
  it("returns nothing rather than throwing when the request fails", async () => {
    mockRoute("action=opensearch", () => errorResponse(500));

    await expect(suggestTitles("mar", new AbortController().signal)).resolves.toEqual([]);
  });

  it("tolerates an unexpected response shape", async () => {
    mockRoute("action=opensearch", () => jsonResponse({ not: "an array" }));

    await expect(suggestTitles("mar", new AbortController().signal)).resolves.toEqual([]);
  });
});

describe("enrichArticle", () => {
  it("returns the view total and creation date", async () => {
    mockRoute("/metrics/pageviews", () => jsonResponse({ items: [{ views: 3 }, { views: 4 }] }));
    mockRoute("prop=revisions", () =>
      jsonResponse({
        query: { pages: { "42": { revisions: [{ timestamp: "2010-05-01T00:00:00Z" }] } } },
      }),
    );

    await expect(enrichArticle("Marie Curie", new AbortController().signal)).resolves.toEqual({
      viewCount30d: 7,
      createdAt: "2010-05-01T00:00:00Z",
    });
  });

  /*
    Enrichment is decoration. A missing view count renders as "views
    unavailable"; it is not an error worth showing anyone, and it must never
    take the card down with it.
  */
  it("degrades to nulls when both extras fail", async () => {
    mockRoute("/metrics/pageviews", () => errorResponse(404));
    mockRoute("prop=revisions", () => errorResponse(500));

    await expect(enrichArticle("Marie Curie", new AbortController().signal)).resolves.toEqual({
      viewCount30d: null,
      createdAt: null,
    });
  });

  it("keeps whichever extra succeeded", async () => {
    mockRoute("/metrics/pageviews", () => jsonResponse({ items: [{ views: 9 }] }));
    mockRoute("prop=revisions", () => errorResponse(500));

    await expect(enrichArticle("Marie Curie", new AbortController().signal)).resolves.toEqual({
      viewCount30d: 9,
      createdAt: null,
    });
  });
});
