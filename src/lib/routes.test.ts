import { describe, expect, it } from "vitest";
import { articleShareUrl, defaultRoute, parseRoute, routesEqual, serializeRoute } from "./routes";

describe("parseRoute", () => {
  it("defaults to the random feed", () => {
    expect(parseRoute("")).toEqual(defaultRoute);
  });

  it("reads every parameter", () => {
    expect(parseRoute("?view=saved&q=cats&article=Cat")).toEqual({
      view: "saved",
      query: "cats",
      related: null,
      category: null,
      article: "Cat",
      lang: "en",
      sort: "relevance",
    });
  });

  it("reads a related seed", () => {
    expect(parseRoute("?like=Marie%20Curie").related).toBe("Marie Curie");
  });

  it("reads a category seed", () => {
    const route = parseRoute("?cat=Physics");
    expect(route.category).toBe("Physics");
    expect(route.query).toBe("");
    expect(route.related).toBeNull();
  });

  /*
    A search, a category and a "more like this" are mutually exclusive seeds.
    A URL carrying more than one is malformed; the one a person can type
    directly outranks the one only a button produces — query, then category,
    then related.
  */
  it("prefers the search when a URL carries both seeds", () => {
    const route = parseRoute("?q=cats&like=Dog");

    expect(route.query).toBe("cats");
    expect(route.related).toBeNull();
  });

  it("prefers the search over a category when a URL carries both", () => {
    const route = parseRoute("?q=cats&cat=Physics");

    expect(route.query).toBe("cats");
    expect(route.category).toBeNull();
  });

  it("prefers the category over a related seed when a URL carries both", () => {
    const route = parseRoute("?cat=Physics&like=Dog");

    expect(route.category).toBe("Physics");
    expect(route.related).toBeNull();
  });

  it("resolves a URL carrying all three seeds down to the search alone", () => {
    const route = parseRoute("?q=cats&cat=Physics&like=Dog");

    expect(route.query).toBe("cats");
    expect(route.category).toBeNull();
    expect(route.related).toBeNull();
  });

  it("ignores unknown parameters", () => {
    expect(parseRoute("?utm_source=twitter&nonsense=1")).toEqual(defaultRoute);
  });

  it("treats an unrecognised view as the feed", () => {
    expect(parseRoute("?view=nonsense").view).toBe("feed");
  });

  it("treats blank values as absent", () => {
    expect(parseRoute("?q=%20%20&article=&like=&cat=")).toEqual(defaultRoute);
  });

  it("reads a supported language", () => {
    expect(parseRoute("?lang=fr").lang).toBe("fr");
  });

  it("is case-insensitive about the language code", () => {
    expect(parseRoute("?lang=FR").lang).toBe("fr");
  });

  it("falls back to English for an unsupported language code", () => {
    expect(parseRoute("?lang=xx").lang).toBe("en");
    expect(parseRoute("?lang=<script>").lang).toBe("en");
  });

  it("reads the recent sort order", () => {
    expect(parseRoute("?sort=recent").sort).toBe("recent");
  });

  it("falls back to relevance for anything else", () => {
    expect(parseRoute("?sort=nonsense").sort).toBe("relevance");
    expect(parseRoute("").sort).toBe("relevance");
  });
});

describe("serializeRoute", () => {
  it("produces an empty string for the default route", () => {
    expect(serializeRoute(defaultRoute)).toBe("");
  });

  it("omits the related seed when a search is present", () => {
    const search = serializeRoute({ ...defaultRoute, query: "cats", related: "Dog" });

    expect(search).toContain("q=cats");
    expect(search).not.toContain("like");
  });

  it("omits the category seed when a search is present", () => {
    const search = serializeRoute({ ...defaultRoute, query: "cats", category: "Physics" });

    expect(search).toContain("q=cats");
    expect(search).not.toContain("cat=");
  });

  it("writes a category seed", () => {
    expect(serializeRoute({ ...defaultRoute, category: "Physics" })).toContain("cat=Physics");
  });

  it("omits the language for the default, English", () => {
    expect(serializeRoute({ ...defaultRoute, lang: "en" })).not.toContain("lang=");
  });

  it("writes a non-default language", () => {
    expect(serializeRoute({ ...defaultRoute, lang: "fr" })).toContain("lang=fr");
  });

  it("writes the sort order only alongside a search query", () => {
    const withoutQuery = serializeRoute({ ...defaultRoute, sort: "recent" });
    const withQuery = serializeRoute({ ...defaultRoute, query: "cats", sort: "recent" });

    expect(withoutQuery).not.toContain("sort=");
    expect(withQuery).toContain("sort=recent");
  });

  it("omits sort for the default, relevance", () => {
    expect(serializeRoute({ ...defaultRoute, query: "cats" })).not.toContain("sort=");
  });
});

describe("round-tripping", () => {
  /*
    URLSearchParams encodes a space as "+" on the way out and decodes "+" back
    to a space on the way in, so a title containing a real plus sign is where
    this breaks if it is going to.
  */
  const titles = [
    "Cat",
    "Marie Curie",
    "AC/DC",
    "Foo & Bar",
    "C++",
    "Rock 'n' Roll",
    "Café",
    "日本",
    "100% (song)",
    "Question?",
    "Hash#Tag",
  ];

  for (const title of titles) {
    it(`round-trips ${title}`, () => {
      const route = { ...defaultRoute, article: title };
      expect(parseRoute(serializeRoute(route))).toEqual(route);
    });
  }

  it("round-trips a full route", () => {
    const route = {
      view: "saved" as const,
      query: "a b+c",
      related: null,
      category: null,
      article: "X&Y",
      lang: "fr",
      sort: "recent" as const,
    };
    expect(parseRoute(serializeRoute(route))).toEqual(route);
  });

  it("round-trips a category route", () => {
    const route = { ...defaultRoute, category: "20th-century physicists" };
    expect(parseRoute(serializeRoute(route))).toEqual(route);
  });
});

describe("routesEqual", () => {
  it("compares by meaning rather than by object identity", () => {
    expect(routesEqual(defaultRoute, { ...defaultRoute })).toBe(true);
    expect(routesEqual(defaultRoute, { ...defaultRoute, article: "Cat" })).toBe(false);
  });
});

describe("articleShareUrl", () => {
  it("shares the app's own link, not Wikipedia's", () => {
    expect(articleShareUrl("Marie Curie", "en", "https://wiki.example", "/")).toBe(
      "https://wiki.example/?article=Marie+Curie",
    );
  });

  it("keeps a sub-path deployment intact", () => {
    expect(articleShareUrl("Cat", "en", "https://example.test", "/scroll/")).toBe(
      "https://example.test/scroll/?article=Cat",
    );
  });

  /*
    Sharing a card read in French must not silently produce a link that opens
    against English Wikipedia, where the title likely doesn't exist.
  */
  it("carries the article's own language, not the default", () => {
    expect(articleShareUrl("Chat", "fr", "https://wiki.example", "/")).toBe(
      "https://wiki.example/?lang=fr&article=Chat",
    );
  });
});
