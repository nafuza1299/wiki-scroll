/*
  The API boundary, typed. Previously `mergeArticle(summary: any, …)` and
  `fetchRandomSummary(): Promise<any>` were the only `any`s in a strict codebase,
  and `summary.content_urls.desktop.page` was dereferenced unguarded — a
  malformed payload threw, and the retry loop swallowed it as "try another
  article", so a shape change would have looked like bad luck.

  Every field is optional here because none of it is under our control. The
  narrowing happens once, in article.ts, and returns null rather than throwing.
*/

/** `GET /api/rest_v1/page/random/summary` and `/page/summary/{title}`. */
export interface RestSummary {
  /** "standard" | "disambiguation" | "no-extract" | "mainpage" — we want standard. */
  type?: string;
  pageid?: number;
  title?: string;
  extract?: string;
  /** ISO timestamp of the most recent revision. */
  timestamp?: string;
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

/** `GET /metrics/pageviews/per-article/...` on wikimedia.org. */
export interface PageviewsResponse {
  items?: Array<{ views?: number | null }>;
}

/** `action=query&prop=revisions` on the Action API (formatversion 1). */
export interface RevisionsResponse {
  query?: {
    pages?: Record<string, { revisions?: Array<{ timestamp?: string }> } | undefined>;
  };
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
