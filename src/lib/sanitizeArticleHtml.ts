/*
  Turns Wikipedia's article HTML into something safe to put in our own DOM.

  This is the largest attack surface in the app: the input is written by anyone
  who can edit a wiki, and it ends up inside our origin, where a bug is an XSS
  with access to whatever this origin holds. MediaWiki sanitises server-side, but
  nothing here may depend on that.

  Three decisions carry the safety:

  1. Parsing goes through DOMParser, which produces an *inert* document — no
     script runs, no resources load, no side effects. Never assign this HTML to
     the innerHTML of a live element to inspect it first.
  2. Tags and attributes are allowlisted, not denylisted. A denylist is a bet
     that you thought of everything; an allowlist fails closed on whatever you
     did not.
  3. Every URL is resolved and checked for an http(s) protocol, which rules out
     `javascript:` and `data:` in one place rather than per attribute.

  index.html carries a CSP as the second line of defence, so that a bug here
  cannot load or execute anything even if it lets markup through.
*/

/** Kept, with their children. */
const ALLOWED_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "var",
  "wbr",
]);

/*
  Dropped along with everything inside them.

  `style` and `link` are here because a stylesheet can reposition anything on the
  page; `svg` and `math` because both carry their own script and href surfaces
  that would each need their own allowlist to be safe.
*/
const DROP_TAGS = new Set([
  "audio",
  "base",
  "button",
  "canvas",
  "embed",
  "form",
  "iframe",
  "input",
  "link",
  "math",
  "meta",
  "noscript",
  "object",
  "script",
  "select",
  "source",
  "style",
  "svg",
  "template",
  "textarea",
  "track",
  "video",
]);

/** Allowed on any kept element. `id` earns its place: footnote anchors need it. */
const GLOBAL_ATTRS = new Set(["class", "id", "dir", "lang", "title"]);

const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "rel", "target"]),
  img: new Set(["src", "alt", "width", "height", "loading", "decoding"]),
  td: new Set(["colspan", "rowspan", "headers"]),
  th: new Set(["colspan", "rowspan", "headers", "scope", "abbr"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
  ol: new Set(["start", "reversed", "type"]),
  li: new Set(["value"]),
  time: new Set(["datetime"]),
};

/*
  Wikipedia's own furniture, removed because the app supplies its own.

  The .pcs-* classes come from the Page Content Service that renders mobile-html.
  They are the least certain part of this file — if the class names have moved,
  the effect is cosmetic (some chrome survives), not a failure.
*/
const CHROME_SELECTORS = [
  ".pcs-edit-section-link",
  ".pcs-edit-section-header",
  ".pcs-edit-section-title",
  "#pcs-footer-container",
  ".pcs-fold-hr",
  ".navbox",
  ".vertical-navbox",
  ".noprint",
  ".mw-empty-elt",
  ".mw-editsection",
  '[role="navigation"]',
];

/** Collapsed-by-default containers, which stay shut without PCS's JavaScript. */
const COLLAPSED_CLASS_PATTERN = /(^|\s)(pcs-collapse-table-collapsed|collapsed)(\s|$)/;
const COLLAPSE_CONTROL_SELECTORS = [
  ".pcs-collapse-table-collapse-text",
  ".pcs-collapse-table-expand-text",
  ".pcs-collapse-table-collapsed-bottom",
];

export interface SanitizeOptions {
  /** Absolute base used to resolve relative URLs, e.g. an article's own URL. */
  baseUrl: string;
}

function isSafeUrl(value: string, baseUrl: string): URL | null {
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Replaces an element with its children, keeping the text. */
function unwrap(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

function titleFromWikiPath(pathname: string): string | null {
  const match = /^\/wiki\/(.+)$/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).replace(/_/g, " ");
  } catch {
    return null;
  }
}

function cleanAnchor(element: Element, baseUrl: string): void {
  const href = element.getAttribute("href");
  if (href === null) return;

  // Footnote and section anchors stay relative — they address this document.
  if (href.startsWith("#")) return;

  const url = isSafeUrl(href, baseUrl);
  if (!url) {
    // javascript:, data:, mailto:, or unparseable. Keep the text, drop the link.
    element.removeAttribute("href");
    element.removeAttribute("target");
    element.removeAttribute("rel");
    return;
  }

  element.setAttribute("href", url.href);

  const wikiTitle = url.hostname.endsWith("wikipedia.org") ? titleFromWikiPath(url.pathname) : null;
  if (wikiTitle) {
    // Marked so the reader can intercept it and stay in the app.
    element.setAttribute("data-wiki-title", wikiTitle);
    element.removeAttribute("target");
    element.setAttribute("rel", "noopener noreferrer");
    return;
  }

  element.setAttribute("target", "_blank");
  element.setAttribute("rel", "noopener noreferrer");
}

function cleanImage(element: Element, baseUrl: string): void {
  const src = element.getAttribute("src");
  const url = src === null ? null : isSafeUrl(src, baseUrl);
  if (!url) {
    element.remove();
    return;
  }
  element.setAttribute("src", url.href);
  element.setAttribute("loading", "lazy");
  element.setAttribute("decoding", "async");
  if (!element.hasAttribute("alt")) element.setAttribute("alt", "");
}

function cleanAttributes(element: Element, tag: string, baseUrl: string): void {
  const allowed = TAG_ATTRS[tag];

  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();

    // Every event handler, and every inline style. `style` is not merely a theme
    // problem: it can position an element over the rest of the page.
    if (name.startsWith("on") || name === "style") {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (GLOBAL_ATTRS.has(name)) continue;
    if (allowed?.has(name)) continue;
    element.removeAttribute(attribute.name);
  }

  if (tag === "a") cleanAnchor(element, baseUrl);
  if (tag === "img") cleanImage(element, baseUrl);
}

function clean(parent: Element, baseUrl: string): void {
  // A snapshot, because unwrapping mutates the live child list.
  for (const child of [...parent.children]) {
    const tag = child.tagName.toLowerCase();

    if (DROP_TAGS.has(tag)) {
      child.remove();
      continue;
    }

    // Descend first, so a subtree is already clean by the time its wrapper is
    // unwrapped into the parent.
    clean(child, baseUrl);

    if (!ALLOWED_TAGS.has(tag)) {
      unwrap(child);
      continue;
    }

    cleanAttributes(child, tag, baseUrl);
  }
}

function stripChrome(root: Element): void {
  for (const element of root.querySelectorAll(CHROME_SELECTORS.join(","))) {
    element.remove();
  }
  for (const element of root.querySelectorAll(COLLAPSE_CONTROL_SELECTORS.join(","))) {
    element.remove();
  }
  // Without PCS's JavaScript these never open, so they are opened here instead.
  for (const element of root.querySelectorAll("[class]")) {
    const className = element.getAttribute("class") ?? "";
    if (COLLAPSED_CLASS_PATTERN.test(className)) {
      element.setAttribute("class", className.replace(COLLAPSED_CLASS_PATTERN, "$1$3"));
    }
    element.removeAttribute("hidden");
  }
}

export function sanitizeArticleHtml(rawHtml: string, options: SanitizeOptions): string {
  // Inert: no scripts run and no resources load while this document exists.
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  const body = doc.body;
  if (!body) return "";

  stripChrome(body);
  clean(body, options.baseUrl);

  return body.innerHTML;
}
