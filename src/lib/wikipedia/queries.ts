/*
  Pure URL builders. Kept separate from the fetching so they can be asserted on
  directly — the 30-day pageviews window in particular is date arithmetic that
  had no coverage at all, which is exactly the kind of code that is wrong by one
  day for a month before anyone notices.
*/

const REST = "https://en.wikipedia.org/api/rest_v1";
const ACTION = "https://en.wikipedia.org/w/api.php";
const METRICS = "https://wikimedia.org/api/rest_v1/metrics";

function yyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export function randomSummaryUrl(): string {
  return `${REST}/page/random/summary`;
}

export function summaryUrl(title: string): string {
  return `${REST}/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

/**
 * The 30 days ending yesterday. Today is excluded because the current day's
 * counts are still accumulating and would read as an artificial dip.
 */
export function pageviews30dUrl(title: string, now: Date = new Date()): string {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);

  const article = encodeURIComponent(title.replace(/ /g, "_"));
  return (
    `${METRICS}/pageviews/per-article/en.wikipedia/all-access/all-agents/` +
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

/** Titles matching a query, most relevant first. `sroffset` paginates. */
export function searchUrl(query: string, limit: number, offset = 0): string {
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
  return `${ACTION}?${params.toString()}`;
}

/**
 * "More like this" — up to ~20 summaries in one request.
 *
 * CirrusSearch's `morelike:` operator is the other option, but Wikimedia
 * throttles non-cacheable morelike queries and offers no stability guarantee,
 * and this returns a shape the app already normalises.
 */
export function relatedUrl(title: string): string {
  return `${REST}/page/related/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

/** Title suggestions for the search box. */
export function openSearchUrl(query: string, limit = 8): string {
  const params = new URLSearchParams({
    action: "opensearch",
    format: "json",
    search: query,
    namespace: "0",
    limit: String(limit),
    origin: "*",
  });
  return `${ACTION}?${params.toString()}`;
}

/**
 * Oldest revision, which is the article's creation date.
 *
 * This cannot be batched: the Action API rejects `rvlimit` alongside multiple
 * titles, and there is no bulk oldest-revision endpoint. That is why creation
 * dates are backfilled per card rather than fetched with the batch.
 */
export function createdDateUrl(title: string): string {
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
  return `${ACTION}?${params.toString()}`;
}
