import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import CategoryFilter from "./CategoryFilter.vue";
import { CATEGORIES } from "../../lib/wikipedia/categories";

const baseProps = { category: "", yearFrom: null, yearTo: null, lang: "en" };

function categoryField() {
  return screen.getByLabelText("Category");
}

function fromField() {
  return screen.getByLabelText("From year");
}

function toField() {
  return screen.getByLabelText("To year");
}

describe("CategoryFilter", () => {
  it("submits the trimmed category with no year bounds", async () => {
    const { emitted } = render(CategoryFilter, { props: baseProps });

    await userEvent.type(categoryField(), "  Physics  {Enter}");

    expect(emitted().submit).toEqual([[{ category: "Physics", yearFrom: null, yearTo: null }]]);
  });

  it("submits a year range alongside the category", async () => {
    const { emitted } = render(CategoryFilter, { props: baseProps });

    await userEvent.type(categoryField(), "Physics");
    await userEvent.type(fromField(), "1900");
    await userEvent.type(toField(), "1950{Enter}");

    expect(emitted().submit).toEqual([[{ category: "Physics", yearFrom: 1900, yearTo: 1950 }]]);
  });

  it("does not submit a blank category, even with year bounds set", async () => {
    const { emitted } = render(CategoryFilter, { props: baseProps });

    // Disabled while the category is blank, so this is the only way years
    // could reach submit() without a category — confirming they can't.
    expect(fromField()).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Browse category" }));

    expect(emitted().submit).toBeUndefined();
  });

  it("submits null for an unparseable year rather than rejecting the submit", async () => {
    const { emitted } = render(CategoryFilter, { props: baseProps });

    await userEvent.type(categoryField(), "Physics");
    await userEvent.type(fromField(), "abc{Enter}");

    expect(emitted().submit).toEqual([[{ category: "Physics", yearFrom: null, yearTo: null }]]);
  });

  it("disables the year fields until a category is typed", async () => {
    render(CategoryFilter, { props: baseProps });

    expect(fromField()).toBeDisabled();
    expect(toField()).toBeDisabled();

    await userEvent.type(categoryField(), "Physics");

    expect(fromField()).toBeEnabled();
    expect(toField()).toBeEnabled();
  });

  it("has no clear button when there is nothing to clear", () => {
    render(CategoryFilter, { props: baseProps });

    expect(screen.queryByRole("button", { name: "Clear category" })).not.toBeInTheDocument();
  });

  it("clears every field and emits clear", async () => {
    const { emitted } = render(CategoryFilter, {
      props: { ...baseProps, category: "Physics", yearFrom: 1900, yearTo: 1950 },
    });

    await userEvent.click(screen.getByRole("button", { name: "Clear category" }));

    expect(emitted().clear).toHaveLength(1);
    expect(categoryField()).toHaveValue("");
    expect(fromField()).toHaveValue("");
    expect(toField()).toHaveValue("");
  });

  it("follows the props when they change from outside", async () => {
    const { rerender } = render(CategoryFilter, { props: baseProps });

    await rerender({ category: "Physics", yearFrom: 1900, yearTo: 1950 });

    expect(categoryField()).toHaveValue("Physics");
    expect(fromField()).toHaveValue("1900");
    expect(toField()).toHaveValue("1950");
  });

  it("shows the curated categories as a real dropdown when the field is focused", async () => {
    render(CategoryFilter, { props: baseProps });

    await userEvent.click(categoryField());

    for (const name of CATEGORIES) {
      expect(screen.getByRole("button", { name })).toBeVisible();
    }
  });

  it("shows no dropdown for a non-English language", async () => {
    render(CategoryFilter, { props: { ...baseProps, lang: "fr" } });

    await userEvent.click(categoryField());

    expect(screen.queryByRole("button", { name: "Physics" })).not.toBeInTheDocument();
  });

  it("filters the dropdown as the category is typed", async () => {
    render(CategoryFilter, { props: baseProps });

    await userEvent.type(categoryField(), "phy");

    expect(screen.getByRole("button", { name: "Physics" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Chemistry" })).not.toBeInTheDocument();
  });

  it("selecting a suggestion fills the field and closes the dropdown", async () => {
    render(CategoryFilter, { props: baseProps });

    await userEvent.click(categoryField());
    await userEvent.click(screen.getByRole("button", { name: "Physics" }));

    expect(categoryField()).toHaveValue("Physics");
    expect(screen.queryByRole("button", { name: "Chemistry" })).not.toBeInTheDocument();
  });

  it("closes the dropdown on Escape", async () => {
    render(CategoryFilter, { props: baseProps });

    await userEvent.click(categoryField());
    expect(screen.getByRole("button", { name: "Physics" })).toBeVisible();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("button", { name: "Physics" })).not.toBeInTheDocument();
  });

  // The dropdown is a shortcut, not a restriction — this is the behaviour
  // that actually matters: anything not in CATEGORIES must still work.
  it("still submits a category that isn't in the curated list", async () => {
    const { emitted } = render(CategoryFilter, { props: baseProps });

    await userEvent.type(categoryField(), "Renaissance sculpture{Enter}");

    expect(emitted().submit).toEqual([
      [{ category: "Renaissance sculpture", yearFrom: null, yearTo: null }],
    ]);
  });
});
