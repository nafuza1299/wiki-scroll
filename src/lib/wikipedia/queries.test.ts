import { describe, expect, it } from "vitest";
import { createdDateUrl, pageviews30dUrl, randomSummaryUrl, summaryUrl } from "./queries";

describe("randomSummaryUrl", () => {
  it("points at the REST random summary endpoint", () => {
    expect(randomSummaryUrl()).toBe("https://en.wikipedia.org/api/rest_v1/page/random/summary");
  });
});

describe("summaryUrl", () => {
  it("underscores spaces and encodes the rest", () => {
    expect(summaryUrl("Marie Curie")).toBe(
      "https://en.wikipedia.org/api/rest_v1/page/summary/Marie_Curie",
    );
  });

  it("encodes characters that would otherwise break the path", () => {
    expect(summaryUrl("AC/DC")).toContain("AC%2FDC");
    expect(summaryUrl("Foo & Bar")).toContain("Foo_%26_Bar");
  });

  it("survives non-ASCII titles", () => {
    expect(summaryUrl("Café")).toContain(encodeURIComponent("Café"));
  });
});

/*
  Date arithmetic with no coverage is how a feed quietly reports the wrong
  window for a month. The window is the 30 days ending yesterday — today is
  excluded because its counts are still accumulating.
*/
describe("pageviews30dUrl", () => {
  it("requests the 30 days ending yesterday", () => {
    const url = pageviews30dUrl("Marie Curie", new Date("2026-03-15T12:00:00Z"));

    expect(url).toContain("/daily/20260213/20260314");
  });

  it("spans month and year boundaries correctly", () => {
    expect(pageviews30dUrl("X", new Date("2026-01-05T00:00:00Z"))).toContain(
      "/daily/20251206/20260104",
    );
  });

  it("handles a leap day in the window", () => {
    expect(pageviews30dUrl("X", new Date("2028-03-05T00:00:00Z"))).toContain(
      "/daily/20280204/20280304",
    );
  });

  it("underscores and encodes the title", () => {
    expect(pageviews30dUrl("AC/DC", new Date("2026-03-15T00:00:00Z"))).toContain("AC%2FDC");
  });
});

describe("createdDateUrl", () => {
  it("asks for the single oldest revision with CORS enabled", () => {
    const url = new URL(createdDateUrl("Marie Curie"));
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
    const params = new URL(createdDateUrl("Foo & Bar")).searchParams;
    expect(params.get("titles")).toBe("Foo & Bar");
  });
});
