import { fetchJson } from "../http";
import { oldestRevisionTimestamp, sumPageviews, toArticle, type Article } from "./article";
import {
  createdDateUrl,
  openSearchUrl,
  pageviews30dUrl,
  randomSummaryUrl,
  relatedUrl,
  searchUrl,
  summaryUrl,
} from "./queries";
import type {
  OpenSearchResponse,
  PageviewsResponse,
  RelatedResponse,
  RestSummary,
  RevisionsResponse,
  SearchListResponse,
} from "./types";

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
  /** True when the source has nothing further to give. Random never exhausts. */
  exhausted: boolean;
  /** Search only: the offset to ask for next. */
  nextOffset?: number;
}

/** Shared filtering: drop unusable, duplicated, and already-seen articles. */
function collectPage(
  candidates: ReadonlyArray<Article | null>,
  size: number,
  exclude?: (id: number) => boolean,
): { articles: Article[]; discarded: number } {
  const articles: Article[] = [];
  const inPage = new Set<number>();
  let discarded = 0;

  for (const article of candidates) {
    if (!article || inPage.has(article.id) || exclude?.(article.id)) {
      discarded += 1;
      continue;
    }
    inPage.add(article.id);
    if (articles.length < size) articles.push(article);
  }

  return { articles, discarded };
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

  const rejected = settled.filter((result) => result.status === "rejected").length;
  const { articles, discarded } = collectPage(
    settled.map((result) => (result.status === "fulfilled" ? result.value : null)),
    size,
    exclude,
  );

  // Only a page with nothing at all in it is a failure. A short page is a
  // perfectly good page.
  if (articles.length === 0) {
    throw new Error(
      rejected === settled.length
        ? "Could not reach Wikipedia."
        : "Wikipedia returned no usable articles.",
    );
  }

  return { articles, discarded, exhausted: false };
}

/** Summaries by title, tolerating individual failures. */
async function summariesFor(
  titles: readonly string[],
  signal: AbortSignal,
): Promise<Array<Article | null>> {
  const settled = await Promise.allSettled(
    titles.map((title) =>
      // Cacheable, unlike random: the same title always means the same article.
      fetchJson<RestSummary>(summaryUrl(title), { signal, retries: 1 }).then(toArticle),
    ),
  );
  return settled.map((result) => (result.status === "fulfilled" ? result.value : null));
}

export async function loadSearchPage(options: {
  query: string;
  size: number;
  offset: number;
  signal: AbortSignal;
  exclude?: (id: number) => boolean;
}): Promise<FeedPageResult> {
  const { query, size, offset, signal, exclude } = options;

  const response = await fetchJson<SearchListResponse>(searchUrl(query, size, offset), { signal });
  const hits = response.query?.search ?? [];
  const titles = hits
    .map((hit) => hit.title)
    .filter((title): title is string => typeof title === "string");

  // No continuation means this was the last page — a real end, unlike random.
  const nextOffset = response.continue?.sroffset;
  const exhausted = nextOffset === undefined;

  if (titles.length === 0) {
    return { articles: [], discarded: 0, exhausted: true };
  }

  const { articles, discarded } = collectPage(await summariesFor(titles, signal), size, exclude);
  return { articles, discarded, exhausted, nextOffset };
}

export async function loadRelatedPage(options: {
  title: string;
  size: number;
  signal: AbortSignal;
  exclude?: (id: number) => boolean;
}): Promise<FeedPageResult> {
  const { title, size, signal, exclude } = options;

  const response = await fetchJson<RelatedResponse>(relatedUrl(title), { signal });
  const candidates = (response.pages ?? []).map(toArticle);
  const { articles, discarded } = collectPage(candidates, size, exclude);

  // One request returns everything related there is.
  return { articles, discarded, exhausted: true };
}

/** Title suggestions for the search box. Never throws — suggestions are optional. */
export async function suggestTitles(query: string, signal: AbortSignal): Promise<string[]> {
  try {
    const response = await fetchJson<OpenSearchResponse>(openSearchUrl(query), { signal });
    return Array.isArray(response?.[1]) ? response[1] : [];
  } catch {
    return [];
  }
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
