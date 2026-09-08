import { describe, expect, it } from "vitest";
import { sanitizeArticleHtml } from "./sanitizeArticleHtml";

const BASE = "https://en.wikipedia.org/wiki/Marie_Curie";

function clean(html: string): string {
  return sanitizeArticleHtml(html, { baseUrl: BASE });
}

/** Parses the output so assertions are about structure, not string matching. */
function parse(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = clean(html);
  return host;
}

describe("script and handler removal", () => {
  it("removes script elements and their contents", () => {
    const output = clean("<p>Before</p><script>alert(1)</script><p>After</p>");

    expect(output).not.toContain("script");
    expect(output).not.toContain("alert");
    expect(output).toContain("Before");
    expect(output).toContain("After");
  });

  it("removes inline event handlers while keeping the element", () => {
    const img = parse('<img src="https://upload.wikimedia.org/a.jpg" onerror="alert(1)">');

    const element = img.querySelector("img");
    expect(element).not.toBeNull();
    expect(element?.hasAttribute("onerror")).toBe(false);
  });

  it("removes handlers regardless of attribute casing", () => {
    const output = clean('<p OnClick="alert(1)" ONMOUSEOVER="x()">text</p>');

    expect(output.toLowerCase()).not.toContain("onclick");
    expect(output.toLowerCase()).not.toContain("onmouseover");
  });

  /*
    style is not only a theming problem: `position: fixed` over the whole
    viewport is a clickjacking primitive.
  */
  it("strips inline styles", () => {
    const output = clean('<div style="position:fixed;inset:0;z-index:9999">x</div>');

    expect(output).not.toContain("style");
    expect(output).toContain("x");
  });

  it("removes style and link elements", () => {
    expect(clean("<style>body{display:none}</style><p>ok</p>")).not.toContain("display:none");
    expect(clean('<link rel="stylesheet" href="https://evil.test/x.css"><p>ok</p>')).not.toContain(
      "evil.test",
    );
  });

  it("removes framing and embedding elements", () => {
    for (const html of [
      '<iframe src="https://evil.test"></iframe>',
      '<object data="https://evil.test"></object>',
      '<embed src="https://evil.test">',
      '<form action="https://evil.test"><input name="p"></form>',
    ]) {
      expect(clean(html)).not.toContain("evil.test");
    }
  });

  it("removes svg and math, which carry their own script surfaces", () => {
    expect(clean("<svg><script>alert(1)</script></svg><p>ok</p>")).not.toContain("alert");
    expect(clean("<math><mi>x</mi></math><p>ok</p>")).not.toContain("<math");
  });
});

describe("URL safety", () => {
  it("drops a javascript: href but keeps the text", () => {
    const host = parse('<a href="javascript:alert(1)">Click me</a>');

    const anchor = host.querySelector("a");
    expect(anchor?.hasAttribute("href")).toBe(false);
    expect(anchor?.textContent).toBe("Click me");
  });

  it("drops a data: href", () => {
    const host = parse('<a href="data:text/html,<script>alert(1)</script>">x</a>');

    expect(host.querySelector("a")?.hasAttribute("href")).toBe(false);
  });

  it("drops an image with an unsafe source entirely", () => {
    expect(parse('<img src="javascript:alert(1)">').querySelector("img")).toBeNull();
    expect(parse("<img>").querySelector("img")).toBeNull();
  });

  it("upgrades a protocol-relative URL rather than leaving it ambiguous", () => {
    const host = parse('<img src="//upload.wikimedia.org/a.jpg">');

    expect(host.querySelector("img")?.getAttribute("src")).toBe(
      "https://upload.wikimedia.org/a.jpg",
    );
  });
});

describe("link rewriting", () => {
  it("makes an internal wiki link absolute and marks it for interception", () => {
    const anchor = parse('<a href="/wiki/Pierre_Curie">Pierre</a>').querySelector("a");

    expect(anchor?.getAttribute("href")).toBe("https://en.wikipedia.org/wiki/Pierre_Curie");
    expect(anchor?.getAttribute("data-wiki-title")).toBe("Pierre Curie");
    // Intercepted in-app, so it must not also open a tab.
    expect(anchor?.hasAttribute("target")).toBe(false);
  });

  it("resolves a relative link against the article's own URL", () => {
    const anchor = parse('<a href="./Radium">Radium</a>').querySelector("a");

    expect(anchor?.getAttribute("data-wiki-title")).toBe("Radium");
  });

  it("decodes a percent-encoded title", () => {
    const anchor = parse('<a href="/wiki/Caf%C3%A9">Café</a>').querySelector("a");

    expect(anchor?.getAttribute("data-wiki-title")).toBe("Café");
  });

  it("opens an external link in a new tab, safely", () => {
    const anchor = parse('<a href="https://example.test/x">External</a>').querySelector("a");

    expect(anchor?.getAttribute("target")).toBe("_blank");
    // Without noopener the opened page gets a handle on this window.
    expect(anchor?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(anchor?.hasAttribute("data-wiki-title")).toBe(false);
  });

  it("leaves footnote anchors addressing this document alone", () => {
    const anchor = parse('<a href="#cite_note-1">[1]</a>').querySelector("a");

    expect(anchor?.getAttribute("href")).toBe("#cite_note-1");
    expect(anchor?.hasAttribute("target")).toBe(false);
  });
});

describe("structure", () => {
  it("unwraps an unknown element but keeps its text", () => {
    const output = clean("<custom-widget>kept</custom-widget>");

    expect(output).not.toContain("custom-widget");
    expect(output).toContain("kept");
  });

  it("unwraps nested unknown elements without losing content", () => {
    const output = clean("<foo><bar>deep</bar></foo>");

    expect(output).not.toContain("<foo");
    expect(output).not.toContain("<bar");
    expect(output).toContain("deep");
  });

  it("cleans elements nested inside unknown wrappers", () => {
    const output = clean('<wrapper><a href="javascript:alert(1)">x</a></wrapper>');

    expect(output).not.toContain("javascript:");
  });

  it("keeps article structure", () => {
    const host = parse(
      "<h2>Life</h2><p>Text with <strong>bold</strong> and <em>italic</em>.</p>" +
        "<ul><li>One</li></ul><table><tr><th>H</th><td>D</td></tr></table>",
    );

    expect(host.querySelector("h2")).not.toBeNull();
    expect(host.querySelector("strong")).not.toBeNull();
    expect(host.querySelector("li")?.textContent).toBe("One");
    expect(host.querySelector("th")?.textContent).toBe("H");
  });

  it("keeps ids so footnote anchors still resolve", () => {
    expect(
      parse('<span id="cite_note-1">note</span>').querySelector("#cite_note-1"),
    ).not.toBeNull();
  });

  it("keeps classes so the reader stylesheet can target them", () => {
    expect(
      parse('<table class="infobox"><tr><td>x</td></tr></table>').querySelector(".infobox"),
    ).not.toBeNull();
  });

  it("keeps table layout attributes but drops presentational ones", () => {
    const cell = parse(
      '<table><tr><td colspan="2" bgcolor="red">x</td></tr></table>',
    ).querySelector("td");

    expect(cell?.getAttribute("colspan")).toBe("2");
    expect(cell?.hasAttribute("bgcolor")).toBe(false);
  });

  it("adds lazy loading and an alt fallback to images", () => {
    const img = parse('<img src="https://upload.wikimedia.org/a.jpg">').querySelector("img");

    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.getAttribute("decoding")).toBe("async");
    expect(img?.getAttribute("alt")).toBe("");
  });
});

describe("chrome removal", () => {
  it("removes Wikipedia's own furniture", () => {
    const output = clean(
      '<p>Body</p><span class="pcs-edit-section-link">edit</span>' +
        '<div class="navbox">nav</div><div id="pcs-footer-container">footer</div>' +
        '<nav role="navigation">menu</nav>',
    );

    expect(output).toContain("Body");
    expect(output).not.toContain("edit");
    expect(output).not.toContain("nav</div>");
    expect(output).not.toContain("footer");
    expect(output).not.toContain("menu");
  });

  /*
    These tables are collapsed by a script that does not run here, so without
    un-collapsing they would be permanently shut.
  */
  it("opens tables that would otherwise stay collapsed", () => {
    const host = parse('<table class="wikitable collapsed"><tr><td>Hidden</td></tr></table>');

    const table = host.querySelector("table");
    expect(table?.className).not.toContain("collapsed");
    expect(table?.className).toContain("wikitable");
    expect(host.textContent).toContain("Hidden");
  });

  it("removes the hidden attribute", () => {
    expect(parse("<p hidden>text</p>").querySelector("p")?.hasAttribute("hidden")).toBe(false);
  });
});

describe("robustness", () => {
  it("returns an empty string for empty input", () => {
    expect(clean("")).toBe("");
  });

  it("does not throw on malformed markup", () => {
    expect(() => clean("<p>unclosed <div><span>tags")).not.toThrow();
  });

  it("does not throw on a href that is not a URL at all", () => {
    expect(() => clean('<a href="::::">x</a>')).not.toThrow();
  });

  it("escapes text that looks like markup", () => {
    expect(clean("<p>1 &lt; 2 &amp; 3 &gt; 2</p>")).toContain("&lt;");
  });
});
