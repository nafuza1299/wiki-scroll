/*
  URL state, kept in the query string with the path always at "/".

  There is no server and no deploy config in this repo, and a static host answers
  /article/Foo with a 404 unless someone writes a rewrite rule. Query parameters
  work everywhere with no configuration at all — and once every parameter lives
  in the query string, a router has nothing left to do that these two pure
  functions do not.
*/

export interface AppRoute {
  view: "feed" | "saved";
  /** Search seed. Empty means not searching. */
  query: string;
  /** "More like this" seed. */
  related: string | null;
  /** Article open in the reader. */
  article: string | null;
}

export const defaultRoute: AppRoute = {
  view: "feed",
  query: "",
  related: null,
  article: null,
};

export function parseRoute(search: string): AppRoute {
  const params = new URLSearchParams(search);
  const view = params.get("view") === "saved" ? "saved" : "feed";

  // A search and a "more like this" are mutually exclusive seeds. If a URL
  // somehow carries both, the search wins rather than the app showing neither.
  const query = params.get("q")?.trim() ?? "";
  const related = query ? null : params.get("like")?.trim() || null;

  return {
    view,
    query,
    related,
    article: params.get("article")?.trim() || null,
  };
}

export function serializeRoute(route: AppRoute): string {
  const params = new URLSearchParams();
  if (route.view === "saved") params.set("view", "saved");
  if (route.query) params.set("q", route.query);
  else if (route.related) params.set("like", route.related);
  if (route.article) params.set("article", route.article);

  const search = params.toString();
  return search ? `?${search}` : "";
}

export function routesEqual(a: AppRoute, b: AppRoute): boolean {
  return serializeRoute(a) === serializeRoute(b);
}

/** The app's own shareable link for an article — not Wikipedia's. */
export function articleShareUrl(title: string, origin?: string, pathname?: string): string {
  const base =
    origin ?? (typeof location === "undefined" ? "https://example.invalid" : location.origin);
  const path = pathname ?? (typeof location === "undefined" ? "/" : location.pathname);
  return `${base}${path}${serializeRoute({ ...defaultRoute, article: title })}`;
}
