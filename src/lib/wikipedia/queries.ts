/*
  Pure URL builders. Kept separate from the fetching so they can be asserted on
  directly — the 30-day pageviews window in particular is date arithmetic that
  had no coverage at all, which is exactly the kind of code that is wrong by one
  day for a month before anyone notices.
*/

import { actionBase, restBase } from "./host";

const METRICS = "https://wikimedia.org/api/rest_v1/metrics";

function yyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export function randomSummaryUrl(lang: string): string {
  return `${restBase(lang)}/page/random/summary`;
}

export function summaryUrl(lang: string, title: string): string {
  return `${restBase(lang)}/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

/**
 * The 30 days ending yesterday. Today is excluded because the current day's
 * counts are still accumulating and would read as an artificial dip.
 */
export function pageviews30dUrl(lang: string, title: string, now: Date = new Date()): string {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);

  const article = encodeURIComponent(title.replace(/ /g, "_"));
  return (
    `${METRICS}/pageviews/per-article/${lang}.wikipedia/all-access/all-agents/` +
    `${article}/daily/${yyyymmdd(start)}/${yyyymmdd(end)}`
  );
}

/*
  Search, related and autocomplete all resolve to REST summaries rather than
  asking the Action API for extracts inline.

  A single generator=search carrying prop=extracts would be one request instead
  of eleven, but it depends on how exlimit interacts with exintro, which this
  environment cannot reach the API to confirm. Going through list=search plus
  per-title summaries costs more requests and uses only shapes this app already
  handles — and the summaries are cacheable, unlike the random endpoint.
*/

/**
 * Titles matching a query, most relevant first by default. `sroffset`
 * paginates; `sort: "recent"` asks CirrusSearch for last-edited-first instead,
 * via `srsort` — omitted entirely for the default so the URL (and the cache key
 * it becomes) is unchanged for anyone not using the new filter.
 */
export function searchUrl(
  lang: string,
  query: string,
  limit: number,
  offset = 0,
  sort: "relevance" | "recent" = "relevance",
): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    list: "search",
    srsearch: query,
    srnamespace: "0",
    srlimit: String(limit),
    sroffset: String(offset),
    srinfo: "totalhits",
    srprop: "",
    origin: "*",
  });
  if (sort === "recent") params.set("srsort", "last_edit_desc");
  return `${actionBase(lang)}?${params.toString()}`;
}

/**
 * "More like this" — up to ~20 summaries in one request.
 *
 * CirrusSearch's `morelike:` operator is the other option, but Wikimedia
 * throttles non-cacheable morelike queries and offers no stability guarantee,
 * and this returns a shape the app already normalises.
 */
export function relatedUrl(lang: string, title: string): string {
  return `${restBase(lang)}/page/related/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

/** Title suggestions for the search box. */
export function openSearchUrl(lang: string, query: string, limit = 8): string {
  const params = new URLSearchParams({
    action: "opensearch",
    format: "json",
    search: query,
    namespace: "0",
    limit: String(limit),
    origin: "*",
  });
  return `${actionBase(lang)}?${params.toString()}`;
}

/**
 * Oldest revision, which is the article's creation date.
 *
 * This cannot be batched: the Action API rejects `rvlimit` alongside multiple
 * titles, and there is no bulk oldest-revision endpoint. That is why creation
 * dates are backfilled per card rather than fetched with the batch.
 */
export function createdDateUrl(lang: string, title: string): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "revisions",
    rvlimit: "1",
    rvdir: "newer",
    rvprop: "timestamp",
    titles: title,
    origin: "*",
  });
  return `${actionBase(lang)}?${params.toString()}`;
}

/**
 * Members of a category as a feed page. `gcmcontinue` is an opaque cursor —
 * unlike search's numeric `sroffset`, it has to be passed back exactly as the
 * API returned it, not incremented by the caller.
 */
export function categoryMembersUrl(
  lang: string,
  category: string,
  limit: number,
  gcmcontinue?: string,
): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "categorymembers",
    gcmtitle: `Category:${category}`,
    gcmtype: "page",
    gcmnamespace: "0",
    gcmlimit: String(limit),
    origin: "*",
  });
  if (gcmcontinue) params.set("gcmcontinue", gcmcontinue);
  return `${actionBase(lang)}?${params.toString()}`;
}
