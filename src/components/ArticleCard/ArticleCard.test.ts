import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import ArticleCard from "./ArticleCard.vue";
import type { Article } from "../../lib/wikipedia/article";

const article: Article = {
  id: 42,
  title: "Marie Curie",
  extract: "A Polish and naturalised-French physicist and chemist.",
  thumbnailUrl: "https://example.test/curie.jpg",
  pageUrl: "https://en.wikipedia.org/wiki/Marie_Curie",
  createdAt: "2001-11-08T00:00:00Z",
  lastEdited: "2026-01-04T00:00:00Z",
  viewCount30d: 128_400,
};

function renderCard(overrides: Partial<Article> = {}) {
  return render(ArticleCard, { props: { article: { ...article, ...overrides }, index: 0 } });
}

describe("ArticleCard", () => {
  it("opens from a click on the title", async () => {
    const { emitted } = renderCard();

    await userEvent.click(screen.getByRole("button", { name: "Marie Curie" }));

    expect(emitted().open).toHaveLength(1);
  });

  /*
    The regression that matters. The card used to be a <section> with a click
    handler and no role, tabindex or key handler, so the app's primary
    interaction was unreachable by keyboard entirely.
  */
  it("opens from the keyboard with Enter", async () => {
    const { emitted } = renderCard();

    screen.getByRole("button", { name: "Marie Curie" }).focus();
    await userEvent.keyboard("{Enter}");

    expect(emitted().open).toHaveLength(1);
  });

  it("opens from the keyboard with Space", async () => {
    const { emitted } = renderCard();

    screen.getByRole("button", { name: "Marie Curie" }).focus();
    await userEvent.keyboard(" ");

    expect(emitted().open).toHaveLength(1);
  });

  it("is reachable by Tab", async () => {
    renderCard();

    await userEvent.tab();

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Marie Curie" }));
  });

  it("does not open the reader when the Wikipedia link is used", async () => {
    const { emitted } = renderCard();

    await userEvent.click(screen.getByRole("link", { name: /Wikipedia/ }));

    expect(emitted().open).toBeUndefined();
  });

  it("links out to the article in a new tab", () => {
    renderCard();

    const link = screen.getByRole("link", { name: /Wikipedia/ });
    expect(link).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Marie_Curie");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("formats the view count compactly", () => {
    renderCard();

    expect(screen.getByText(/128K views \/ 30d/)).toBeInTheDocument();
  });

  it("says so when view counts are unavailable", () => {
    renderCard({ viewCount30d: null });

    expect(screen.getByText("views unavailable")).toBeInTheDocument();
  });

  it("omits the created date when it is unknown", () => {
    renderCard({ createdAt: null });

    expect(screen.queryByText(/^Created /)).not.toBeInTheDocument();
  });

  /*
    The card used to render `new Date(article.lastEdited)` unguarded, so a
    payload with a bad or absent timestamp printed the literal string
    "Invalid Date" into the metadata row.
  */
  it("never renders 'Invalid Date'", () => {
    renderCard({ lastEdited: "not a date", createdAt: "also not a date" });

    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Edited /)).not.toBeInTheDocument();
  });

  it("omits the edited date when the API returned none", () => {
    renderCard({ lastEdited: null });

    expect(screen.queryByText(/^Edited /)).not.toBeInTheDocument();
  });

  it("falls back to a placeholder when there is no thumbnail", () => {
    renderCard({ thumbnailUrl: null });

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("W")).toBeInTheDocument();
  });
});
