import { fetchJson } from "../http";
import { oldestRevisionTimestamp, sumPageviews, toArticle, type Article } from "./article";
import { createdDateUrl, pageviews30dUrl, randomSummaryUrl } from "./queries";
import type { PageviewsResponse, RestSummary, RevisionsResponse } from "./types";

/** How many extra summaries to request so filtering still yields a full page. */
const OVERFETCH = 1.5;

/*
  Two changes to how a page of the feed is loaded.

  1. Nothing blocks on view counts or creation dates any more. The old code
     awaited all three requests per article before a single card could render:
     ten cards cost thirty blocking requests. Now a page costs one request per
     article, and the two enrichments stream in afterwards and patch the card in
     place. `viewCount30d` and `createdAt` were already nullable, so the card
     renders correctly before they arrive.

  2. One bad article no longer destroys the page. `Promise.all` meant a single
     rejection rejected the batch — which, combined with a missing .catch(), is
     precisely how a failed first load left the app on a skeleton forever.
     allSettled keeps whatever resolved.

  Worth knowing for later: all of `random/summary` can be collapsed into a single
  `action=query&generator=random` call carrying extracts, thumbnails, URLs,
  revisions and `prop=pageviews&pvipdays=30` for every page at once — ten cards
  for one request instead of ten. It is not done here because `exlimit` interacts
  with `exintro` in a way this environment cannot reach the API to confirm, and
  guessing wrong would break the feed rather than degrade it. The swap is
  confined to loadRandomPage and a new URL builder.
*/

export interface FeedPageResult {
  articles: Article[];
  /** Summaries that were fetched but not usable — disambiguation pages, stubs. */
  discarded: number;
}

async function fetchRandomSummary(signal: AbortSignal): Promise<Article | null> {
  // "bypass": every call shares one URL but must produce a different article, so
  // caching or in-flight sharing would collapse the whole batch into one page.
  const summary = await fetchJson<RestSummary>(randomSummaryUrl(), {
    signal,
    cache: "bypass",
    retries: 1,
  });
  return toArticle(summary);
}

export async function loadRandomPage(options: {
  size: number;
  signal: AbortSignal;
  /**
   * Rejects ids the caller already has. A predicate rather than a Set so the
   * caller can combine sources — what is on screen, and what was read earlier.
   */
  exclude?: (id: number) => boolean;
}): Promise<FeedPageResult> {
  const { size, signal, exclude } = options;
  const requested = Math.ceil(size * OVERFETCH);

  const settled = await Promise.allSettled(
    Array.from({ length: requested }, () => fetchRandomSummary(signal)),
  );

  if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");

  const articles: Article[] = [];
  const seenInPage = new Set<number>();
  let discarded = 0;
  let rejected = 0;

  for (const result of settled) {
    if (result.status === "rejected") {
      rejected += 1;
      continue;
    }
    const article = result.value;
    if (!article) {
      discarded += 1;
      continue;
    }
    if (seenInPage.has(article.id) || exclude?.(article.id)) {
      discarded += 1;
      continue;
    }
    seenInPage.add(article.id);
    if (articles.length < size) articles.push(article);
  }

  // Only a page with nothing at all in it is a failure. A short page is a
  // perfectly good page.
  if (articles.length === 0) {
    throw new Error(
      rejected === settled.length
        ? "Could not reach Wikipedia."
        : "Wikipedia returned no usable articles.",
    );
  }

  return { articles, discarded };
}

export interface ArticleEnrichment {
  viewCount30d: number | null;
  createdAt: string | null;
}

/**
 * The two per-article extras, fetched off the critical path. Both fail silently:
 * a missing view count is a caption that reads "views unavailable", not an error
 * worth showing anyone.
 */
export async function enrichArticle(
  title: string,
  signal: AbortSignal,
): Promise<ArticleEnrichment> {
  const [views, created] = await Promise.allSettled([
    fetchJson<PageviewsResponse>(pageviews30dUrl(title), { signal, retries: 1 }),
    fetchJson<RevisionsResponse>(createdDateUrl(title), { signal, retries: 1 }),
  ]);

  return {
    viewCount30d: views.status === "fulfilled" ? sumPageviews(views.value) : null,
    createdAt: created.status === "fulfilled" ? oldestRevisionTimestamp(created.value) : null,
  };
}
