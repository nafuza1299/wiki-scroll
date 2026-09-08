import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import Button from "./Button.vue";

const slot = (text: string) => ({ default: () => text });

describe("Button", () => {
  it("renders its slot and emits click", async () => {
    const { emitted } = render(Button, { slots: slot("Save") });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(emitted().click).toHaveLength(1);
  });

  it("defaults to type=button so it cannot submit a surrounding form", () => {
    render(Button, { slots: slot("Save") });

    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("disables interaction and marks itself busy while loading", async () => {
    const { emitted } = render(Button, { props: { loading: true }, slots: slot("Save") });

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    await userEvent.click(button);
    expect(emitted().click).toBeUndefined();
  });

  it("does not emit click while disabled", async () => {
    const { emitted } = render(Button, { props: { disabled: true }, slots: slot("Save") });

    await userEvent.click(screen.getByRole("button"));

    expect(emitted().click).toBeUndefined();
  });

  it("passes aria-label through to the element", () => {
    render(Button, { props: { iconOnly: true }, attrs: { "aria-label": "Close" } });

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("applies variant and size styles", () => {
    render(Button, { props: { variant: "destructive", size: "lg" }, slots: slot("Delete") });

    const button = screen.getByRole("button");
    expect(button).toHaveClass("bg-danger");
    expect(button).toHaveClass("h-11");
  });

  it("keeps the 44px touch-target floor at the small size", () => {
    render(Button, { props: { size: "sm" }, slots: slot("Save") });

    expect(screen.getByRole("button")).toHaveClass("min-h-11");
  });
});
