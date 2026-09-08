import { fetchText, isAbortError } from "../http";

const REST = "https://en.wikipedia.org/api/rest_v1";
const ACTION = "https://en.wikipedia.org/w/api.php";

export function mobileHtmlUrl(title: string): string {
  return `${REST}/page/mobile-html/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

export function parseHtmlUrl(title: string): string {
  const params = new URLSearchParams({
    action: "parse",
    format: "json",
    formatversion: "2",
    prop: "text",
    page: title,
    origin: "*",
  });
  return `${ACTION}?${params.toString()}`;
}

interface ParseResponse {
  parse?: { text?: string };
}

/*
  Deliberately the only place the reader's HTML comes from.

  mobile-html is a RESTBase endpoint, and RESTBase is being retired in stages —
  the transform endpoints went in early 2026. If it disappears, or turns out not
  to send permissive CORS headers, only this function changes: action=parse
  returns comparable HTML from the Action API, which is not going anywhere and
  definitely honours origin=*. Its markup carries desktop parser classes rather
  than PCS ones, so reader.css needs a few more selectors, and that is the whole
  cost of the swap.
*/
export async function fetchArticleHtml(title: string, signal: AbortSignal): Promise<string> {
  try {
    return await fetchText(mobileHtmlUrl(title), { signal, retries: 1 });
  } catch (error) {
    if (isAbortError(error)) throw error;
    const response = await fetchJsonParse(title, signal);
    if (response) return response;
    throw error;
  }
}

async function fetchJsonParse(title: string, signal: AbortSignal): Promise<string | null> {
  try {
    const raw = await fetchText(parseHtmlUrl(title), { signal, retries: 1 });
    const data = JSON.parse(raw) as ParseResponse;
    return data.parse?.text ?? null;
  } catch {
    return null;
  }
}
