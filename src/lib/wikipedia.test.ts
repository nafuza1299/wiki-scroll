import { mergeArticle, truncateExtract } from "./wikipedia";

describe("truncateExtract", () => {
  it("leaves short extracts untouched", () => {
    expect(truncateExtract("A short summary.")).toBe("A short summary.");
  });

  it("truncates long extracts at a word boundary with an ellipsis", () => {
    const long = "word ".repeat(100).trim();
    const result = truncateExtract(long);
    expect(result.length).toBeLessThanOrEqual(281);
    expect(result.endsWith("…")).toBe(true);
    expect(result.endsWith(" …")).toBe(false);
  });
});

describe("mergeArticle", () => {
  const baseSummary = {
    pageid: 42,
    title: "Test Article",
    extract: "An extract.",
    thumbnail: { source: "https://example.com/thumb.jpg" },
    content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Test_Article" } },
    timestamp: "2024-01-01T00:00:00Z",
  };

  it("merges summary fields, view count, and created date into an Article", () => {
    const article = mergeArticle(baseSummary, 1234, "2010-05-01T00:00:00Z");
    expect(article).toEqual({
      id: 42,
      title: "Test Article",
      extract: "An extract.",
      thumbnailUrl: "https://example.com/thumb.jpg",
      pageUrl: "https://en.wikipedia.org/wiki/Test_Article",
      createdAt: "2010-05-01T00:00:00Z",
      lastEdited: "2024-01-01T00:00:00Z",
      viewCount30d: 1234,
    });
  });

  it("falls back to null thumbnail/viewCount/createdAt when unavailable", () => {
    const { thumbnail, ...rest } = baseSummary;
    const article = mergeArticle(rest, null, null);
    expect(article.thumbnailUrl).toBeNull();
    expect(article.viewCount30d).toBeNull();
    expect(article.createdAt).toBeNull();
  });
});
