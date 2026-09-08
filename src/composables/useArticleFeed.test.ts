import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { render } from "@testing-library/vue";
import { useArticleFeed, type ArticleFeed, type SeenTracker } from "./useArticleFeed";
import type { FeedMode } from "./feedReducer";
import { clearHttpCaches } from "../lib/http";
import { errorResponse, jsonResponse, mockRoute } from "../test/fetchMock";
import { intersect, observedElements } from "../test/observerMock";
import type { RestSummary } from "../lib/wikipedia/types";

afterEach(() => clearHttpCaches());

/*
  Real timers throughout. The HTTP layer retries with exponential backoff, so
  flushing microtasks proves nothing — vi.waitFor polls until the state actually
  settles, which is also closer to what the app does.
*/
const waitOptions = { timeout: 5000, interval: 20 };

function summary(id: number): RestSummary {
  return {
    type: "standard",
    pageid: id,
    title: `Article ${id}`,
    extract: "An extract.",
    content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/Article_${id}` } },
    timestamp: "2026-01-01T00:00:00Z",
  };
}

/** Serves every mode: random draws, search hits, related pages, enrichment. */
function serveArticles(options: { searchHits?: number; searchTotal?: number } = {}): void {
  const { searchHits = 4, searchTotal = 4 } = options;

  let next = 0;
  mockRoute("/page/random/summary", () => {
    next += 1;
    return jsonResponse(summary(next));
  });

  // list=search returns titles; each title is then resolved to a summary.
  mockRoute("list=search", ({ url }) => {
    const offset = Number(new URL(url).searchParams.get("sroffset") ?? 0);
    const remaining = Math.max(0, searchTotal - offset);
    const count = Math.min(searchHits, remaining);
    return jsonResponse({
      query: {
        search: Array.from({ length: count }, (_, i) => ({
          pageid: 1000 + offset + i,
          title: `Result ${offset + i}`,
        })),
      },
      ...(offset + count < searchTotal ? { continue: { sroffset: offset + count } } : {}),
    });
  });

  mockRoute("/page/summary/", ({ url }) => {
    const title = decodeURIComponent(url.split("/page/summary/")[1] ?? "");
    const id = 1000 + Number(title.replace(/\D+/g, "") || 0);
    return jsonResponse({ ...summary(id), title });
  });

  mockRoute("/page/related/", () =>
    jsonResponse({ pages: [summary(2001), summary(2002), summary(2003)] }),
  );

  mockRoute("/metrics/pageviews", () => jsonResponse({ items: [{ views: 5 }] }));
  mockRoute("prop=revisions", () => jsonResponse({ query: { pages: {} } }));
}

function failEverything(): void {
  mockRoute("/page/random/summary", () => errorResponse(503));
  mockRoute("/metrics/pageviews", () => errorResponse(503));
  mockRoute("prop=revisions", () => errorResponse(503));
}

/*
  A fresh in-memory seen-set per mount. The real one is a persisted app-wide
  singleton, so without injecting here each test would inherit the ids the
  previous test read and the feed would legitimately run out of articles.
*/
function makeSeen(initial: readonly number[] = []): SeenTracker {
  const ids = new Set(initial);
  return {
    has: (id) => ids.has(id),
    remember: (incoming) => incoming.forEach((id) => ids.add(id)),
  };
}

/** Mounts the composable in a real component, so lifecycle hooks actually run. */
function mountFeed(mode = ref<FeedMode>({ kind: "random" }), seen: SeenTracker = makeSeen()) {
  let feed!: ArticleFeed;
  const Harness = defineComponent({
    setup() {
      feed = useArticleFeed(mode, { seen });
      return () =>
        h(
          "div",
          feed.articles.value.map((article, index) =>
            h("article", { key: article.id, ref: feed.registerCard(index) }, article.title),
          ),
        );
    },
  });

  const utils = render(Harness);
  return { ...utils, feed: () => feed, mode };
}

describe("useArticleFeed", () => {
  it("loads a first page and becomes ready", async () => {
    serveArticles();
    const { feed } = mountFeed();

    await vi.waitFor(() => expect(feed().status.value).toBe("ready"), waitOptions);

    expect(feed().articles.value.length).toBeGreaterThan(0);
  });

  /*
    The regression this rewrite exists for.

    Previously fetchBatch(...).then(...) had no .catch(), fetchBatch was
    Promise.all, and a rejection left `articles` empty with no error state — so
    App rendered its skeleton branch forever and the failure surfaced only as an
    unhandled rejection in the console.
  */
  it("surfaces an error instead of hanging when the first load fails", async () => {
    failEverything();
    const { feed } = mountFeed();

    await vi.waitFor(() => expect(feed().status.value).toBe("error"), waitOptions);

    expect(feed().error.value).toBeTruthy();
  });

  it("recovers when retry succeeds", async () => {
    failEverything();
    const { feed } = mountFeed();
    await vi.waitFor(() => expect(feed().status.value).toBe("error"), waitOptions);

    serveArticles();
    feed().retry();

    await vi.waitFor(() => expect(feed().status.value).toBe("ready"), waitOptions);
    expect(feed().error.value).toBeNull();
  });

  /*
    The second half of the same bug: a failed page also left batchInFlight and
    isFetchingMore stuck true, which killed pagination for the whole session.
  */
  it("keeps its articles and stays paginable when a later page fails", async () => {
    serveArticles();
    const { feed } = mountFeed();
    await vi.waitFor(() => expect(feed().status.value).toBe("ready"), waitOptions);
    const loaded = feed().articles.value.length;

    failEverything();
    feed().loadMore();
    await vi.waitFor(() => expect(feed().more.value).toBe("error"), waitOptions);

    expect(feed().status.value).toBe("ready");
    expect(feed().articles.value).toHaveLength(loaded);

    serveArticles();
    feed().retry();

    await vi.waitFor(
      () => expect(feed().articles.value.length).toBeGreaterThan(loaded),
      waitOptions,
    );
    expect(feed().more.value).not.toBe("error");
  });

  it("does not start a second page while one is already in flight", async () => {
    serveArticles();
    const { feed } = mountFeed();
    await vi.waitFor(() => expect(feed().status.value).toBe("ready"), waitOptions);
    const loaded = feed().articles.value.length;

    feed().loadMore();
    feed().loadMore();
    feed().loadMore();

    await vi.waitFor(() => expect(feed().more.value).toBe("idle"), waitOptions);

    // Three calls, one page's worth of articles.
    expect(feed().articles.value.length).toBeLessThanOrEqual(loaded * 2);
  });

  it("paginates when a card near the end scrolls into view", async () => {
    serveArticles();
    const { feed } = mountFeed();
    await vi.waitFor(() => expect(feed().status.value).toBe("ready"), waitOptions);
    const loaded = feed().articles.value.length;

    const cards = observedElements();
    intersect(cards[cards.length - 1]);

    await vi.waitFor(
      () => expect(feed().articles.value.length).toBeGreaterThan(loaded),
      waitOptions,
    );
  });

  /*
    The old observeCard never called unobserve, so observations accumulated for
    the lifetime of the session.
  */
  it("releases its observations when unmounted", async () => {
    serveArticles();
    const { feed, unmount } = mountFeed();
    await vi.waitFor(() => expect(feed().status.value).toBe("ready"), waitOptions);
    expect(observedElements().length).toBeGreaterThan(0);

    unmount();

    await vi.waitFor(() => expect(observedElements()).toHaveLength(0), waitOptions);
  });

  it("clears the feed and reloads when the mode changes", async () => {
    serveArticles();
    const mode = ref<FeedMode>({ kind: "random" });
    const { feed } = mountFeed(mode);
    await vi.waitFor(() => expect(feed().status.value).toBe("ready"), waitOptions);
    const first = feed().articles.value.map((article) => article.id);

    mode.value = { kind: "search", query: "cats" };

    await vi.waitFor(() => {
      expect(feed().status.value).toBe("ready");
      expect(feed().articles.value.map((article) => article.id)).not.toEqual(first);
    }, waitOptions);
  });

  /*
    The recency filter. Articles read in an earlier session are excluded, which
    is what makes a refresh continue rather than re-serve the same page.
  */
  it("skips articles that have already been seen", async () => {
    serveArticles();
    const { feed } = mountFeed(ref<FeedMode>({ kind: "random" }), makeSeen([1, 2, 3]));

    await vi.waitFor(() => expect(feed().status.value).toBe("ready"), waitOptions);

    const ids = feed().articles.value.map((article) => article.id);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
    expect(ids).not.toContain(3);
  });

  it("remembers a page so the next one does not repeat it", async () => {
    serveArticles();
    const seen = makeSeen();
    const { feed } = mountFeed(ref<FeedMode>({ kind: "random" }), seen);

    await vi.waitFor(() => expect(feed().status.value).toBe("ready"), waitOptions);

    for (const article of feed().articles.value) {
      expect(seen.has(article.id)).toBe(true);
    }
  });

  it("loads search results in search mode", async () => {
    serveArticles();
    const mode = ref<FeedMode>({ kind: "search", query: "cats" });
    const { feed } = mountFeed(mode);

    await vi.waitFor(() => expect(feed().status.value).toBe("ready"), waitOptions);

    expect(feed().articles.value.every((a) => a.title.startsWith("Result"))).toBe(true);
  });

  /*
    Search has a real end, unlike random. Once the API stops returning a
    continuation, the feed says so rather than spinning on every scroll.
  */
  it("marks a search exhausted when there are no more results", async () => {
    serveArticles({ searchHits: 2, searchTotal: 2 });
    const mode = ref<FeedMode>({ kind: "search", query: "cats" });
    const { feed } = mountFeed(mode);

    await vi.waitFor(() => expect(feed().more.value).toBe("exhausted"), waitOptions);
  });

  it("reports an empty search rather than an error", async () => {
    serveArticles({ searchHits: 0, searchTotal: 0 });
    const mode = ref<FeedMode>({ kind: "search", query: "zzzzzz" });
    const { feed } = mountFeed(mode);

    await vi.waitFor(() => expect(feed().status.value).toBe("empty"), waitOptions);
    expect(feed().error.value).toBeNull();
  });

  /*
    The reading-history filter must not apply to search: hiding a match because
    it was scrolled past last week would look like the search is broken.
  */
  it("does not hide search results that were seen before", async () => {
    serveArticles();
    const mode = ref<FeedMode>({ kind: "search", query: "cats" });
    const { feed } = mountFeed(mode, makeSeen([1000, 1001, 1002, 1003]));

    await vi.waitFor(() => expect(feed().status.value).toBe("ready"), waitOptions);

    expect(feed().articles.value.length).toBeGreaterThan(0);
  });

  it("loads related articles in one request and then stops", async () => {
    serveArticles();
    const mode = ref<FeedMode>({ kind: "related", title: "Cat" });
    const { feed } = mountFeed(mode);

    await vi.waitFor(() => expect(feed().status.value).toBe("ready"), waitOptions);

    expect(feed().articles.value.map((a) => a.id)).toEqual([2001, 2002, 2003]);
    expect(feed().more.value).toBe("exhausted");
  });

  it("enriches cards with view counts after the page has rendered", async () => {
    serveArticles();
    const { feed } = mountFeed();

    await vi.waitFor(
      () => expect(feed().articles.value.some((a) => a.viewCount30d === 5)).toBe(true),
      waitOptions,
    );
  });
});
