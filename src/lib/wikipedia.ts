export interface Article {
  id: number;
  title: string;
  extract: string;
  thumbnailUrl: string | null;
  pageUrl: string;
  createdAt: string | null;
  lastEdited: string;
  viewCount30d: number | null;
}

const EXTRACT_MAX_LEN = 280;

export function truncateExtract(extract: string): string {
  if (extract.length <= EXTRACT_MAX_LEN) return extract;
  const cut = extract.slice(0, EXTRACT_MAX_LEN);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : EXTRACT_MAX_LEN)}…`;
}

export function mergeArticle(
  summary: any,
  viewCount30d: number | null,
  createdAt: string | null,
): Article {
  return {
    id: summary.pageid,
    title: summary.title,
    extract: truncateExtract(summary.extract ?? ""),
    thumbnailUrl: summary.thumbnail?.source ?? null,
    pageUrl: summary.content_urls.desktop.page,
    createdAt,
    lastEdited: summary.timestamp,
    viewCount30d,
  };
}

async function fetchRandomSummary(): Promise<any> {
  const res = await fetch("https://en.wikipedia.org/api/rest_v1/page/random/summary");
  if (!res.ok) throw new Error(`random summary failed: ${res.status}`);
  const data = await res.json();
  if (data.type !== "standard") throw new Error("non-standard page, retry");
  return data;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function fetchPageviews30d(title: string): Promise<number | null> {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  const article = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${article}/daily/${formatDate(start)}/${formatDate(end)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.items.reduce((sum: number, item: { views: number }) => sum + item.views, 0);
  } catch {
    return null;
  }
}

async function fetchCreatedDate(title: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=revisions&rvlimit=1&rvdir=newer&rvprop=timestamp&titles=${encodeURIComponent(title)}&origin=*`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const page: any = Object.values(data.query.pages)[0];
    return page?.revisions?.[0]?.timestamp ?? null;
  } catch {
    return null;
  }
}

export async function fetchArticle(retriesLeft = 5): Promise<Article> {
  try {
    const summary = await fetchRandomSummary();
    const [viewCount30d, createdAt] = await Promise.all([
      fetchPageviews30d(summary.title),
      fetchCreatedDate(summary.title),
    ]);
    return mergeArticle(summary, viewCount30d, createdAt);
  } catch (err) {
    if (retriesLeft <= 0) throw err;
    return fetchArticle(retriesLeft - 1);
  }
}

export function fetchBatch(size: number): Promise<Article[]> {
  return Promise.all(Array.from({ length: size }, () => fetchArticle()));
}
