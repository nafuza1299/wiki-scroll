import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { render } from "@testing-library/vue";
import { useArticleFeed, type ArticleFeed } from "./useArticleFeed";
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

/** The random endpoint serves a fresh article per call, as the real one does. */
function serveArticles(): void {
  let next = 0;
  mockRoute("/page/random/summary", () => {
    next += 1;
    return jsonResponse(summary(next));
  });
  mockRoute("/metrics/pageviews", () => jsonResponse({ items: [{ views: 5 }] }));
  mockRoute("prop=revisions", () => jsonResponse({ query: { pages: {} } }));
}

function failEverything(): void {
  mockRoute("/page/random/summary", () => errorResponse(503));
  mockRoute("/metrics/pageviews", () => errorResponse(503));
  mockRoute("prop=revisions", () => errorResponse(503));
}

/** Mounts the composable in a real component, so lifecycle hooks actually run. */
function mountFeed(mode = ref<FeedMode>({ kind: "random" })) {
  let feed!: ArticleFeed;
  const Harness = defineComponent({
    setup() {
      feed = useArticleFeed(mode);
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

  it("enriches cards with view counts after the page has rendered", async () => {
    serveArticles();
    const { feed } = mountFeed();

    await vi.waitFor(
      () => expect(feed().articles.value.some((a) => a.viewCount30d === 5)).toBe(true),
      waitOptions,
    );
  });
});
