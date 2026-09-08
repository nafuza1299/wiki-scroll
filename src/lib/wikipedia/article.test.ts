import { describe, expect, it } from "vitest";
import { oldestRevisionTimestamp, sumPageviews, toArticle, truncateExtract } from "./article";
import type { RestSummary } from "./types";

const summary: RestSummary = {
  type: "standard",
  pageid: 42,
  title: "Test Article",
  extract: "An extract.",
  thumbnail: { source: "https://example.com/thumb.jpg" },
  content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Test_Article" } },
  timestamp: "2024-01-01T00:00:00Z",
};

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

  it("leaves an extract of exactly the limit alone", () => {
    const exact = "x".repeat(280);
    expect(truncateExtract(exact)).toBe(exact);
  });

  it("hard-cuts when there is no word boundary to cut at", () => {
    const unbroken = "x".repeat(300);
    expect(truncateExtract(unbroken)).toBe(`${"x".repeat(280)}…`);
  });

  it("handles an empty extract", () => {
    expect(truncateExtract("")).toBe("");
  });
});

describe("toArticle", () => {
  it("narrows a well-formed summary", () => {
    expect(toArticle(summary)).toEqual({
      id: 42,
      title: "Test Article",
      extract: "An extract.",
      thumbnailUrl: "https://example.com/thumb.jpg",
      pageUrl: "https://en.wikipedia.org/wiki/Test_Article",
      createdAt: null,
      lastEdited: "2024-01-01T00:00:00Z",
      viewCount30d: null,
    });
  });

  it("nulls the thumbnail when there is none", () => {
    expect(toArticle({ ...summary, thumbnail: undefined })?.thumbnailUrl).toBeNull();
  });

  it("treats a missing extract as empty rather than failing", () => {
    expect(toArticle({ ...summary, extract: undefined })?.extract).toBe("");
  });

  it("rejects disambiguation pages and other non-standard types", () => {
    expect(toArticle({ ...summary, type: "disambiguation" })).toBeNull();
    expect(toArticle({ ...summary, type: "no-extract" })).toBeNull();
    expect(toArticle({ ...summary, type: "mainpage" })).toBeNull();
  });

  /*
    The old mergeArticle dereferenced summary.content_urls.desktop.page
    unguarded, so a shape like this threw — and the retry loop swallowed it as
    "try another article", which would have made an API change look like bad
    luck rather than a bug.
  */
  it("returns null instead of throwing on a malformed payload", () => {
    expect(toArticle({ ...summary, content_urls: undefined })).toBeNull();
    expect(toArticle({ ...summary, content_urls: { desktop: {} } })).toBeNull();
    expect(toArticle({ ...summary, pageid: undefined })).toBeNull();
    expect(toArticle({ ...summary, title: undefined })).toBeNull();
    expect(toArticle({})).toBeNull();
  });

  it("keeps lastEdited nullable rather than inventing a date", () => {
    expect(toArticle({ ...summary, timestamp: undefined })?.lastEdited).toBeNull();
  });
});

describe("sumPageviews", () => {
  it("sums the window", () => {
    expect(sumPageviews({ items: [{ views: 10 }, { views: 5 }, { views: 1 }] })).toBe(16);
  });

  it("counts a null day as zero rather than poisoning the total", () => {
    expect(sumPageviews({ items: [{ views: 10 }, { views: null }, {}] })).toBe(10);
  });

  it("returns null when the window is missing entirely", () => {
    expect(sumPageviews({})).toBeNull();
  });

  it("returns zero for an empty but present window", () => {
    expect(sumPageviews({ items: [] })).toBe(0);
  });
});

describe("oldestRevisionTimestamp", () => {
  it("reads the timestamp of the single returned revision", () => {
    expect(
      oldestRevisionTimestamp({
        query: { pages: { "42": { revisions: [{ timestamp: "2010-05-01T00:00:00Z" }] } } },
      }),
    ).toBe("2010-05-01T00:00:00Z");
  });

  it("returns null for a missing page, missing revisions, or an error shape", () => {
    expect(oldestRevisionTimestamp({})).toBeNull();
    expect(oldestRevisionTimestamp({ query: { pages: {} } })).toBeNull();
    expect(oldestRevisionTimestamp({ query: { pages: { "-1": {} } } })).toBeNull();
    expect(oldestRevisionTimestamp({ query: { pages: { "42": { revisions: [] } } } })).toBeNull();
  });
});
