import type { PageviewsResponse, RestSummary, RevisionsResponse } from "./types";

export interface Article {
  id: number;
  title: string;
  extract: string;
  thumbnailUrl: string | null;
  pageUrl: string;
  createdAt: string | null;
  /** Null when the payload carried no revision timestamp. */
  lastEdited: string | null;
  viewCount30d: number | null;
}

const EXTRACT_MAX_LEN = 280;

export function truncateExtract(extract: string): string {
  if (extract.length <= EXTRACT_MAX_LEN) return extract;
  const cut = extract.slice(0, EXTRACT_MAX_LEN);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : EXTRACT_MAX_LEN)}…`;
}

/**
 * Narrows a summary payload into an Article, or returns null if it is not one
 * we can show. Returning null rather than throwing is the point: an unusable
 * payload is an ordinary outcome of asking for a *random* page, not an error,
 * and the caller drops it and keeps the rest of the batch.
 */
export function toArticle(summary: RestSummary): Article | null {
  // "standard" excludes disambiguation pages, extract-less stubs and the main
  // page. It is the only quality filter the REST endpoint gives us.
  if (summary.type !== undefined && summary.type !== "standard") return null;

  const id = summary.pageid;
  const title = summary.title;
  const pageUrl = summary.content_urls?.desktop?.page;
  if (typeof id !== "number" || !title || !pageUrl) return null;

  return {
    id,
    title,
    extract: truncateExtract(summary.extract ?? ""),
    thumbnailUrl: summary.thumbnail?.source ?? null,
    pageUrl,
    createdAt: null,
    lastEdited: summary.timestamp ?? null,
    viewCount30d: null,
  };
}

/** Null when the window is unavailable; individual missing days count as zero. */
export function sumPageviews(response: PageviewsResponse): number | null {
  const items = response.items;
  if (!Array.isArray(items)) return null;
  return items.reduce((total, item) => total + (item?.views ?? 0), 0);
}

export function oldestRevisionTimestamp(response: RevisionsResponse): string | null {
  const pages = response.query?.pages;
  if (!pages) return null;
  const first = Object.values(pages)[0];
  return first?.revisions?.[0]?.timestamp ?? null;
}
