import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/vue";
import Skeleton from "./Skeleton.vue";

describe("Skeleton", () => {
  it("is decorative by default so screen readers skip it", () => {
    const { container } = render(Skeleton);

    const element = container.firstElementChild;
    expect(element).toHaveAttribute("aria-hidden", "true");
    expect(element).not.toHaveAttribute("role");
  });

  it("announces the wait when given a label", () => {
    render(Skeleton, { props: { label: "Loading articles" } });

    const status = screen.getByRole("status", { name: "Loading articles" });
    expect(status).not.toHaveAttribute("aria-hidden");
  });

  it("applies the shape silhouette and respects caller sizing", () => {
    const { container } = render(Skeleton, {
      props: { shape: "circle" },
      attrs: { class: "w-10" },
    });

    const element = container.firstElementChild;
    expect(element).toHaveClass("aspect-square");
    expect(element).toHaveClass("w-10");
  });

  it("disables its pulse under reduced motion", () => {
    const { container } = render(Skeleton);

    expect(container.firstElementChild).toHaveClass("motion-reduce:animate-none");
  });
});
