import { beforeEach, describe, expect, it } from "vitest";
import { useSavedArticles } from "./useSavedArticles";
import { useSeenArticles } from "./useSeenArticles";
import type { Article } from "../lib/wikipedia/article";

function article(id: number, lang = "en"): Article {
  return {
    id,
    lang,
    title: `Article ${id}`,
    extract: "An extract.",
    thumbnailUrl: null,
    pageUrl: `https://${lang}.wikipedia.org/wiki/Article_${id}`,
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

    expect(isSaved("en", 1)).toBe(false);
    toggle(article(1));
    expect(isSaved("en", 1)).toBe(true);
    expect(count.value).toBe(1);

    toggle(article(1));
    expect(isSaved("en", 1)).toBe(false);
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
    expect(useSavedArticles().isSaved("en", 3)).toBe(true);
  });

  it("removes by lang and id", () => {
    const { toggle, remove, isSaved } = useSavedArticles();
    toggle(article(1));

    remove("en", 1);

    expect(isSaved("en", 1)).toBe(false);
  });

  it("clears everything", () => {
    const { toggle, clear, count } = useSavedArticles();
    toggle(article(1));
    toggle(article(2));

    clear();

    expect(count.value).toBe(0);
  });

  /*
    Pageids are only unique per-wiki. A French article and an English article
    can share the same numeric id and be completely unrelated — without the
    (lang, id) composite key, saving one would make the other look saved too.
  */
  it("does not confuse a same-numbered article from a different wiki", () => {
    const { toggle, isSaved } = useSavedArticles();

    toggle(article(1, "en"));

    expect(isSaved("en", 1)).toBe(true);
    expect(isSaved("fr", 1)).toBe(false);
  });

  /*
    v1 entries (saved before language switching existed) have no `lang` field.
    They must be dropped rather than crash the store or silently mismatch —
    the same "corrupt or outdated → fallback" path any other bad payload takes.
  */
  it("discards a pre-language-switcher (v1) payload instead of crashing", () => {
    localStorage.setItem(
      "wiki-scroll:saved",
      JSON.stringify({
        v: 1,
        data: {
          entries: [
            {
              id: 1,
              title: "Old Entry",
              pageUrl: "https://en.wikipedia.org/wiki/Old_Entry",
              extract: "",
              thumbnailUrl: null,
              createdAt: null,
              lastEdited: null,
              viewCount30d: null,
              savedAt: Date.now(),
            },
          ],
        },
      }),
    );

    window.dispatchEvent(new StorageEvent("storage", { key: "wiki-scroll:saved" }));

    expect(useSavedArticles().count.value).toBe(0);
  });
});

describe("useSeenArticles", () => {
  it("remembers articles across calls", () => {
    const { remember, has } = useSeenArticles();

    remember([
      { lang: "en", id: 1 },
      { lang: "en", id: 2 },
      { lang: "en", id: 3 },
    ]);

    expect(has("en", 2)).toBe(true);
    expect(has("en", 9)).toBe(false);
  });

  it("does not double-count a repeat", () => {
    const { remember, count } = useSeenArticles();

    remember([
      { lang: "en", id: 1 },
      { lang: "en", id: 2 },
    ]);
    remember([
      { lang: "en", id: 2 },
      { lang: "en", id: 3 },
    ]);

    expect(count.value).toBe(3);
  });

  it("is a no-op when nothing is new", () => {
    const { remember, count } = useSeenArticles();
    remember([{ lang: "en", id: 1 }]);

    remember([{ lang: "en", id: 1 }]);

    expect(count.value).toBe(1);
  });

  /*
    Pageids are only unique per-wiki. Without the composite key, marking an
    English article seen would wrongly hide a same-numbered French one too.
  */
  it("does not confuse a same-numbered article from a different wiki", () => {
    const { remember, has } = useSeenArticles();

    remember([{ lang: "en", id: 1 }]);

    expect(has("en", 1)).toBe(true);
    expect(has("fr", 1)).toBe(false);
  });

  /*
    This is a recency filter with a cap, not a permanent memory. The UI says so
    too, rather than promising the feed "never repeats".
  */
  it("drops the oldest entries once the cap is reached", () => {
    const { remember, has, count } = useSeenArticles();

    remember(Array.from({ length: 5200 }, (_, i) => ({ lang: "en", id: i + 1 })));

    expect(count.value).toBe(5000);
    expect(has("en", 1)).toBe(false);
    expect(has("en", 5200)).toBe(true);
  });

  it("clears history", () => {
    const { remember, clear, count } = useSeenArticles();
    remember([
      { lang: "en", id: 1 },
      { lang: "en", id: 2 },
    ]);

    clear();

    expect(count.value).toBe(0);
  });

  /*
    v1 entries (`ids: number[]`, saved before language switching existed) don't
    have the `keys: string[]` shape this version expects. They must be dropped
    rather than crash the store.
  */
  it("discards a pre-language-switcher (v1) payload instead of crashing", () => {
    localStorage.setItem("wiki-scroll:seen", JSON.stringify({ v: 1, data: { ids: [1, 2, 3] } }));

    window.dispatchEvent(new StorageEvent("storage", { key: "wiki-scroll:seen" }));

    expect(useSeenArticles().count.value).toBe(0);
  });
});
