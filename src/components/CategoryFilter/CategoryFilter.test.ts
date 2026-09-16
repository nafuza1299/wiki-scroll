import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import CategoryFilter from "./CategoryFilter.vue";

const baseProps = { category: "", yearFrom: null, yearTo: null };

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
      props: { category: "Physics", yearFrom: 1900, yearTo: 1950 },
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
});
