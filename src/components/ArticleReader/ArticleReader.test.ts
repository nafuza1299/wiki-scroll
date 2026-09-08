import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import ArticleReader from "./ArticleReader.vue";
import { clearHttpCaches } from "../../lib/http";
import { errorResponse, mockRoute, textResponse } from "../../test/fetchMock";

afterEach(() => clearHttpCaches());

const PAGE_URL = "https://en.wikipedia.org/wiki/Marie_Curie";

function renderReader(props: Record<string, unknown> = {}) {
  return render(ArticleReader, {
    props: { title: "Marie Curie", pageUrl: PAGE_URL, ...props },
  });
}

function serveHtml(html: string): void {
  mockRoute("/page/mobile-html/", () => textResponse(html));
}

describe("ArticleReader", () => {
  it("shows the card's extract while the article loads, so the panel is never blank", () => {
    mockRoute("/page/mobile-html/", () => new Promise<Response>(() => {}));

    renderReader({ preview: "A Polish physicist and chemist." });

    expect(screen.getByText("A Polish physicist and chemist.")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading article" })).toBeInTheDocument();
  });

  it("renders the article once it arrives", async () => {
    serveHtml("<h2>Early life</h2><p>Born in Warsaw.</p>");

    renderReader();

    await vi.waitFor(() => expect(screen.getByText("Born in Warsaw.")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Early life" })).toBeInTheDocument();
  });

  it("sanitises what it renders", async () => {
    serveHtml("<p>Safe</p><script>window.__pwned = true;</script>");

    renderReader();

    await vi.waitFor(() => expect(screen.getByText("Safe")).toBeInTheDocument());
    expect(document.body.innerHTML).not.toContain("__pwned");
  });

  /*
    An internal wiki link must stay in the app rather than navigating away — that
    is what makes the reader a reader rather than a launcher.
  */
  it("intercepts an internal wiki link instead of following it", async () => {
    serveHtml('<p>See <a href="/wiki/Pierre_Curie">Pierre Curie</a>.</p>');

    const { emitted } = renderReader();
    await vi.waitFor(() =>
      expect(screen.getByRole("link", { name: "Pierre Curie" })).toBeVisible(),
    );

    await userEvent.click(screen.getByRole("link", { name: "Pierre Curie" }));

    expect(emitted().navigate).toEqual([["Pierre Curie"]]);
  });

  it("leaves external links to the browser", async () => {
    serveHtml('<p><a href="https://example.test/x">External</a></p>');

    const { emitted } = renderReader();
    await vi.waitFor(() => expect(screen.getByRole("link", { name: "External" })).toBeVisible());

    const link = screen.getByRole("link", { name: "External" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(emitted().navigate).toBeUndefined();
  });

  it("offers a retry when the article cannot be loaded", async () => {
    mockRoute("/page/mobile-html/", () => errorResponse(500));
    mockRoute("action=parse", () => errorResponse(500));

    renderReader();

    await vi.waitFor(
      () => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the article"),
      { timeout: 5000 },
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  /*
    Falls back to the Action API's parser when the RESTBase endpoint is gone —
    RESTBase is being retired in stages, so this is a live risk, not a hypothetical.
  */
  it("falls back to action=parse when mobile-html fails", async () => {
    mockRoute("/page/mobile-html/", () => errorResponse(404));
    mockRoute("action=parse", () =>
      textResponse(JSON.stringify({ parse: { text: "<p>From the parser.</p>" } })),
    );

    renderReader();

    await vi.waitFor(() => expect(screen.getByText("From the parser.")).toBeInTheDocument(), {
      timeout: 5000,
    });
  });

  /*
    Rendering the prose outside Wikipedia's own chrome moves the CC BY-SA
    attribution obligation onto this app. The iframe was satisfying it for free.
  */
  it("attributes the article and links to its authors", async () => {
    serveHtml("<p>Body</p>");

    renderReader();

    await vi.waitFor(() => expect(screen.getByText("Body")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "CC BY-SA 4.0" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Authors" })).toHaveAttribute(
      "href",
      `${PAGE_URL}?action=history`,
    );
  });
});
