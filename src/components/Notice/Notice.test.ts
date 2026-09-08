import { describe, expect, it } from "vitest";
import { h } from "vue";
import { render, screen } from "@testing-library/vue";
import Notice from "./Notice.vue";

describe("Notice", () => {
  it("renders a title and message", () => {
    render(Notice, { props: { title: "Couldn't load articles", message: "Network is down." } });

    expect(screen.getByText("Couldn't load articles")).toBeInTheDocument();
    expect(screen.getByText("Network is down.")).toBeInTheDocument();
  });

  it("omits the message when there is none", () => {
    const { container } = render(Notice, { props: { title: "That's everything." } });

    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  /*
    A failure the user did not ask for should interrupt; an expected empty result
    should not. Same component, different urgency.
  */
  it("announces an error assertively", () => {
    render(Notice, { props: { title: "Broken", tone: "error" } });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
  });

  it("announces a neutral notice politely", () => {
    render(Notice, { props: { title: "Nothing to show" } });

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("renders actions from the slot", () => {
    render(Notice, {
      props: { title: "Broken", tone: "error" },
      slots: { default: () => h("button", { type: "button" }, "Try again") },
    });

    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("uses tighter padding when compact", () => {
    render(Notice, { props: { title: "Couldn't load more", compact: true } });

    expect(screen.getByRole("status")).toHaveClass("py-4");
  });
});
