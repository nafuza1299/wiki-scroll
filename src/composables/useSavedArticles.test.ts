import { beforeEach, describe, expect, it } from "vitest";
import { useSavedArticles } from "./useSavedArticles";
import { useSeenArticles } from "./useSeenArticles";
import type { Article } from "../lib/wikipedia/article";

function article(id: number): Article {
  return {
    id,
    title: `Article ${id}`,
    extract: "An extract.",
    thumbnailUrl: null,
    pageUrl: `https://en.wikipedia.org/wiki/Article_${id}`,
    createdAt: null,
    lastEdited: null,
    viewCount30d: null,
  };
}

// The stores are app-wide singletons, so reset through the public API.
beforeEach(() => {
  useSavedArticles().clear();
  useSeenArticles().clear();
});

describe("useSavedArticles", () => {
  it("saves and un-saves", () => {
    const { isSaved, toggle, count } = useSavedArticles();

    expect(isSaved(1)).toBe(false);
    toggle(article(1));
    expect(isSaved(1)).toBe(true);
    expect(count.value).toBe(1);

    toggle(article(1));
    expect(isSaved(1)).toBe(false);
    expect(count.value).toBe(0);
  });

  it("lists newest first", async () => {
    const { toggle, saved } = useSavedArticles();

    toggle(article(1));
    await new Promise((resolve) => setTimeout(resolve, 2));
    toggle(article(2));

    expect(saved.value[0].id).toBe(2);
  });

  /*
    The whole card payload is stored, not just the id, so the saved list renders
    without a single network request.
  */
  it("keeps enough of the article to render it offline", () => {
    const { toggle, saved } = useSavedArticles();

    toggle(article(1));

    expect(saved.value[0]).toMatchObject({
      title: "Article 1",
      extract: "An extract.",
      pageUrl: "https://en.wikipedia.org/wiki/Article_1",
    });
  });

  it("survives a reload", () => {
    useSavedArticles().toggle(article(3));

    // A second call reads the same persisted store.
    expect(useSavedArticles().isSaved(3)).toBe(true);
  });

  it("removes by id", () => {
    const { toggle, remove, isSaved } = useSavedArticles();
    toggle(article(1));

    remove(1);

    expect(isSaved(1)).toBe(false);
  });

  it("clears everything", () => {
    const { toggle, clear, count } = useSavedArticles();
    toggle(article(1));
    toggle(article(2));

    clear();

    expect(count.value).toBe(0);
  });
});

describe("useSeenArticles", () => {
  it("remembers ids across calls", () => {
    const { remember, has } = useSeenArticles();

    remember([1, 2, 3]);

    expect(has(2)).toBe(true);
    expect(has(9)).toBe(false);
  });

  it("does not double-count a repeat", () => {
    const { remember, count } = useSeenArticles();

    remember([1, 2]);
    remember([2, 3]);

    expect(count.value).toBe(3);
  });

  it("is a no-op when nothing is new", () => {
    const { remember, count } = useSeenArticles();
    remember([1]);

    remember([1]);

    expect(count.value).toBe(1);
  });

  /*
    This is a recency filter with a cap, not a permanent memory. The UI says so
    too, rather than promising the feed "never repeats".
  */
  it("drops the oldest ids once the cap is reached", () => {
    const { remember, has, count } = useSeenArticles();

    remember(Array.from({ length: 5200 }, (_, i) => i + 1));

    expect(count.value).toBe(5000);
    expect(has(1)).toBe(false);
    expect(has(5200)).toBe(true);
  });

  it("clears history", () => {
    const { remember, clear, count } = useSeenArticles();
    remember([1, 2]);

    clear();

    expect(count.value).toBe(0);
  });
});
