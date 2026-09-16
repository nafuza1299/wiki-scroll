/*
  URL state, kept in the query string with the path always at "/".

  There is no server and no deploy config in this repo, and a static host answers
  /article/Foo with a 404 unless someone writes a rewrite rule. Query parameters
  work everywhere with no configuration at all — and once every parameter lives
  in the query string, a router has nothing left to do that these two pure
  functions do not.
*/

import { isSupportedLang } from "./wikipedia/languages";

export interface AppRoute {
  view: "feed" | "saved";
  /** Search seed. Empty means not searching. */
  query: string;
  /** "More like this" seed. */
  related: string | null;
  /** Category-browsing seed, bare name without the "Category:" prefix. */
  category: string | null;
  /** Article open in the reader. */
  article: string | null;
  /** MediaWiki language/subdomain code. Always one of the supported codes. */
  lang: string;
  /** Search refinement. Meaningless outside search mode, but always present. */
  sort: "relevance" | "recent";
}

export const defaultRoute: AppRoute = {
  view: "feed",
  query: "",
  related: null,
  category: null,
  article: null,
  lang: "en",
  sort: "relevance",
};

export function parseRoute(search: string): AppRoute {
  const params = new URLSearchParams(search);
  const view = params.get("view") === "saved" ? "saved" : "feed";

  // A search, a category and a "more like this" are mutually exclusive seeds.
  // If a URL somehow carries more than one, the one a person can type directly
  // wins over the one only a button produces: query, then category, then
  // related.
  const query = params.get("q")?.trim() ?? "";
  const category = query ? null : params.get("cat")?.trim() || null;
  const related = query || category ? null : params.get("like")?.trim() || null;

  const rawLang = params.get("lang")?.trim().toLowerCase() ?? "";
  const lang = isSupportedLang(rawLang) ? rawLang : "en";

  const sort = params.get("sort") === "recent" ? "recent" : "relevance";

  return {
    view,
    query,
    related,
    category,
    article: params.get("article")?.trim() || null,
    lang,
    sort,
  };
}

export function serializeRoute(route: AppRoute): string {
  const params = new URLSearchParams();
  // Omitted for the default language, so the common-case URL is exactly as
  // short as it was before language switching existed.
  if (route.lang !== "en") params.set("lang", route.lang);
  if (route.view === "saved") params.set("view", "saved");
  if (route.query) {
    params.set("q", route.query);
    // Sort is a refinement of a text search specifically, not a sticky
    // preference — it disappears the instant the query does, same as `like`
    // already only appears when there is no query.
    if (route.sort !== "relevance") params.set("sort", route.sort);
  } else if (route.category) {
    params.set("cat", route.category);
  } else if (route.related) {
    params.set("like", route.related);
  }
  if (route.article) params.set("article", route.article);

  const search = params.toString();
  return search ? `?${search}` : "";
}

export function routesEqual(a: AppRoute, b: AppRoute): boolean {
  return serializeRoute(a) === serializeRoute(b);
}

/**
 * The app's own shareable link for an article — not Wikipedia's.
 *
 * Takes the article's own language rather than defaulting to "en": without it,
 * sharing a card read in French would silently produce a link that opens the
 * same title against English Wikipedia, where it likely doesn't exist.
 */
export function articleShareUrl(
  title: string,
  lang: string,
  origin?: string,
  pathname?: string,
): string {
  const base =
    origin ?? (typeof location === "undefined" ? "https://example.invalid" : location.origin);
  const path = pathname ?? (typeof location === "undefined" ? "/" : location.pathname);
  return `${base}${path}${serializeRoute({ ...defaultRoute, article: title, lang })}`;
}
