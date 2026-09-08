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
