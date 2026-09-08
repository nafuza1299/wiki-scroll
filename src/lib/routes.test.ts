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
      article: "Cat",
    });
  });

  it("reads a related seed", () => {
    expect(parseRoute("?like=Marie%20Curie").related).toBe("Marie Curie");
  });

  /*
    A search and a "more like this" are mutually exclusive seeds. A URL carrying
    both is malformed; picking one beats showing neither.
  */
  it("prefers the search when a URL carries both seeds", () => {
    const route = parseRoute("?q=cats&like=Dog");

    expect(route.query).toBe("cats");
    expect(route.related).toBeNull();
  });

  it("ignores unknown parameters", () => {
    expect(parseRoute("?utm_source=twitter&nonsense=1")).toEqual(defaultRoute);
  });

  it("treats an unrecognised view as the feed", () => {
    expect(parseRoute("?view=nonsense").view).toBe("feed");
  });

  it("treats blank values as absent", () => {
    expect(parseRoute("?q=%20%20&article=&like=")).toEqual(defaultRoute);
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
    const route = { view: "saved" as const, query: "a b+c", related: null, article: "X&Y" };
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
    expect(articleShareUrl("Marie Curie", "https://wiki.example", "/")).toBe(
      "https://wiki.example/?article=Marie+Curie",
    );
  });

  it("keeps a sub-path deployment intact", () => {
    expect(articleShareUrl("Cat", "https://example.test", "/scroll/")).toBe(
      "https://example.test/scroll/?article=Cat",
    );
  });
});
