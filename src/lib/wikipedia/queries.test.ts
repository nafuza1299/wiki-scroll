import { describe, expect, it } from "vitest";
import {
  createdDateUrl,
  openSearchUrl,
  pageviews30dUrl,
  randomSummaryUrl,
  relatedUrl,
  searchUrl,
  summaryUrl,
} from "./queries";

describe("randomSummaryUrl", () => {
  it("points at the REST random summary endpoint", () => {
    expect(randomSummaryUrl("en")).toBe("https://en.wikipedia.org/api/rest_v1/page/random/summary");
  });

  it("builds the host from the language, not just en", () => {
    expect(randomSummaryUrl("fr")).toBe("https://fr.wikipedia.org/api/rest_v1/page/random/summary");
  });
});

describe("summaryUrl", () => {
  it("underscores spaces and encodes the rest", () => {
    expect(summaryUrl("en", "Marie Curie")).toBe(
      "https://en.wikipedia.org/api/rest_v1/page/summary/Marie_Curie",
    );
  });

  it("encodes characters that would otherwise break the path", () => {
    expect(summaryUrl("en", "AC/DC")).toContain("AC%2FDC");
    expect(summaryUrl("en", "Foo & Bar")).toContain("Foo_%26_Bar");
  });

  it("survives non-ASCII titles", () => {
    expect(summaryUrl("en", "Café")).toContain(encodeURIComponent("Café"));
  });

  it("uses the requested language's host", () => {
    expect(summaryUrl("de", "Katze")).toBe(
      "https://de.wikipedia.org/api/rest_v1/page/summary/Katze",
    );
  });
});

/*
  Date arithmetic with no coverage is how a feed quietly reports the wrong
  window for a month. The window is the 30 days ending yesterday — today is
  excluded because its counts are still accumulating.
*/
describe("pageviews30dUrl", () => {
  it("requests the 30 days ending yesterday", () => {
    const url = pageviews30dUrl("en", "Marie Curie", new Date("2026-03-15T12:00:00Z"));

    expect(url).toContain("/daily/20260213/20260314");
  });

  it("spans month and year boundaries correctly", () => {
    expect(pageviews30dUrl("en", "X", new Date("2026-01-05T00:00:00Z"))).toContain(
      "/daily/20251206/20260104",
    );
  });

  it("handles a leap day in the window", () => {
    expect(pageviews30dUrl("en", "X", new Date("2028-03-05T00:00:00Z"))).toContain(
      "/daily/20280204/20280304",
    );
  });

  it("underscores and encodes the title", () => {
    expect(pageviews30dUrl("en", "AC/DC", new Date("2026-03-15T00:00:00Z"))).toContain("AC%2FDC");
  });

  it("puts the language into the project path segment", () => {
    expect(pageviews30dUrl("fr", "Chat", new Date("2026-03-15T00:00:00Z"))).toContain(
      "/pageviews/per-article/fr.wikipedia/",
    );
  });
});

describe("searchUrl", () => {
  it("asks the Action API for article-namespace titles with CORS enabled", () => {
    const params = new URL(searchUrl("en", "cats", 10)).searchParams;

    expect(params.get("list")).toBe("search");
    expect(params.get("srsearch")).toBe("cats");
    expect(params.get("srnamespace")).toBe("0");
    expect(params.get("srlimit")).toBe("10");
    expect(params.get("origin")).toBe("*");
  });

  it("carries the pagination offset", () => {
    expect(new URL(searchUrl("en", "cats", 10, 30)).searchParams.get("sroffset")).toBe("30");
  });

  it("escapes a query that would otherwise break the query string", () => {
    const params = new URL(searchUrl("en", "a&b=c", 10)).searchParams;
    expect(params.get("srsearch")).toBe("a&b=c");
  });

  it("uses the requested language's host", () => {
    expect(new URL(searchUrl("ja", "cats", 10)).origin).toBe("https://ja.wikipedia.org");
  });

  it("omits srsort for the default relevance order", () => {
    expect(new URL(searchUrl("en", "cats", 10)).searchParams.has("srsort")).toBe(false);
  });

  it("sets srsort=last_edit_desc when sorting by recency", () => {
    const params = new URL(searchUrl("en", "cats", 10, 0, "recent")).searchParams;
    expect(params.get("srsort")).toBe("last_edit_desc");
  });
});

describe("relatedUrl", () => {
  it("points at the REST related endpoint with an underscored title", () => {
    expect(relatedUrl("en", "Marie Curie")).toBe(
      "https://en.wikipedia.org/api/rest_v1/page/related/Marie_Curie",
    );
  });

  it("encodes a slash in the title", () => {
    expect(relatedUrl("en", "AC/DC")).toContain("AC%2FDC");
  });
});

describe("openSearchUrl", () => {
  it("asks for article-namespace suggestions", () => {
    const params = new URL(openSearchUrl("en", "mar")).searchParams;

    expect(params.get("action")).toBe("opensearch");
    expect(params.get("search")).toBe("mar");
    expect(params.get("namespace")).toBe("0");
    expect(params.get("origin")).toBe("*");
  });

  it("sends the requested suggestion limit", () => {
    expect(new URL(openSearchUrl("en", "mar", 5)).searchParams.get("limit")).toBe("5");
  });
});

describe("createdDateUrl", () => {
  it("asks for the single oldest revision with CORS enabled", () => {
    const url = new URL(createdDateUrl("en", "Marie Curie"));
    const params = url.searchParams;

    expect(url.origin + url.pathname).toBe("https://en.wikipedia.org/w/api.php");
    expect(params.get("prop")).toBe("revisions");
    expect(params.get("rvdir")).toBe("newer");
    expect(params.get("rvlimit")).toBe("1");
    expect(params.get("titles")).toBe("Marie Curie");
    // Without origin=* the browser gets no CORS headers back at all.
    expect(params.get("origin")).toBe("*");
  });

  it("escapes a title containing an ampersand", () => {
    const params = new URL(createdDateUrl("en", "Foo & Bar")).searchParams;
    expect(params.get("titles")).toBe("Foo & Bar");
  });
});
