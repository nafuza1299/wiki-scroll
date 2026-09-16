import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import SearchBar from "./SearchBar.vue";
import { clearHttpCaches } from "../../lib/http";
import { jsonResponse, mockRoute } from "../../test/fetchMock";

afterEach(() => clearHttpCaches());

// Real timers throughout, matching useArticleFeed.test.ts's own rule: the
// suggestion fetch is debounced with a real setTimeout, so flushing
// microtasks alone proves nothing — vi.waitFor polls until it actually fires.
const waitOptions = { timeout: 2000, interval: 20 };

const baseProps = { modelValue: "", lang: "en", sort: "relevance" as const, showSort: false };

/*
  role="searchbox" does not apply here: an <input type="search"> that also
  carries a `list` attribute (for the suggestions datalist) maps to
  role="combobox" instead, per the accessible-name-and-description spec. The
  field's own <label> is the reliable way to find it.
*/
function searchField() {
  return screen.getByLabelText("Search Wikipedia");
}

describe("SearchBar", () => {
  it("submits the trimmed field value", async () => {
    const { emitted } = render(SearchBar, { props: baseProps });

    await userEvent.type(searchField(), "  cats  {Enter}");

    expect(emitted()["update:modelValue"]).toEqual([["cats"]]);
  });

  it("clears the field and emits an empty query", async () => {
    const { emitted } = render(SearchBar, { props: { ...baseProps, modelValue: "cats" } });

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(emitted()["update:modelValue"]).toEqual([[""]]);
  });

  it("has no clear button when there is nothing to clear", () => {
    render(SearchBar, { props: baseProps });

    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("follows modelValue when it changes from outside", async () => {
    const { rerender } = render(SearchBar, { props: baseProps });

    await rerender({ modelValue: "Category:Physics" });

    expect(searchField()).toHaveValue("Category:Physics");
  });

  /*
    A sort order is meaningless for "related" or "category" seeds — only a
    text search has one, so App.vue hides the control rather than disabling it.
  */
  it("hides the sort control unless showSort is true", () => {
    render(SearchBar, { props: baseProps });
    expect(screen.queryByLabelText("Sort search results")).not.toBeInTheDocument();
  });

  it("shows the sort control when showSort is true", () => {
    render(SearchBar, { props: { ...baseProps, showSort: true } });
    expect(screen.getByLabelText("Sort search results")).toHaveValue("relevance");
  });

  it("emits the chosen sort order", async () => {
    const { emitted } = render(SearchBar, { props: { ...baseProps, showSort: true } });

    await userEvent.selectOptions(screen.getByLabelText("Sort search results"), "recent");

    expect(emitted()["update:sort"]).toEqual([["recent"]]);
  });

  it("fetches suggestions from the requested language", async () => {
    let requested: string | undefined;
    mockRoute("action=opensearch", ({ url }) => {
      requested = url;
      return jsonResponse(["mar", ["Marie Curie"], [], []]);
    });

    render(SearchBar, { props: { ...baseProps, lang: "fr" } });
    await userEvent.type(searchField(), "mar");

    await vi.waitFor(() => expect(requested).toBeDefined(), waitOptions);
    expect(requested).toContain("fr.wikipedia.org");
  });
});
