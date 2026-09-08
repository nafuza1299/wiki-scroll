import { describe, expect, it } from "vitest";
import { h, nextTick, type VNodeChild } from "vue";
import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { Modal } from "./Modal";

/*
  Slots are built with h() rather than template strings: Vite resolves `vue` to
  the runtime-only build, so there is no compiler available to tests.
*/
const slot = (children: () => VNodeChild) => ({ default: children });

function renderModal(
  props: Record<string, unknown> = {},
  bodyProps: { scrollable?: boolean } = {},
) {
  return render(Modal, {
    props: { open: true, ...props },
    slots: slot(() => [
      h(
        Modal.Header,
        null,
        slot(() =>
          h(
            Modal.Title,
            null,
            slot(() => "Delete project"),
          ),
        ),
      ),
      h(
        Modal.Body,
        bodyProps,
        slot(() => [
          h("button", { type: "button" }, "First"),
          h("button", { type: "button" }, "Last"),
        ]),
      ),
    ]),
  });
}

/** A focused element outside the dialog, standing in for the trigger. */
function mountTrigger(): HTMLButtonElement {
  const trigger = document.createElement("button");
  trigger.textContent = "Open";
  document.body.append(trigger);
  trigger.focus();
  return trigger;
}

describe("Modal", () => {
  it("renders a dialog named by Modal.Title", () => {
    renderModal();

    expect(screen.getByRole("dialog", { name: "Delete project" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
  });

  it("renders nothing while closed", () => {
    renderModal({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("emits update:open(false) on Escape", async () => {
    const { emitted } = renderModal();

    await userEvent.keyboard("{Escape}");

    expect(emitted()["update:open"]).toEqual([[false]]);
  });

  it("ignores Escape when closeOnEscape is false", async () => {
    const { emitted } = renderModal({ closeOnEscape: false });

    await userEvent.keyboard("{Escape}");

    expect(emitted()["update:open"]).toBeUndefined();
  });

  it("emits from the header close button", async () => {
    const { emitted } = renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(emitted()["update:open"]).toEqual([[false]]);
  });

  it("moves focus into the dialog and restores it on close", async () => {
    const trigger = mountTrigger();
    const { rerender } = renderModal();
    await nextTick();

    expect(document.activeElement).not.toBe(trigger);
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);

    await rerender({ open: false });
    await nextTick();

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("wraps Tab from the last focusable element back to the first", async () => {
    renderModal();
    await nextTick();

    const last = screen.getByRole("button", { name: "Last" });
    const close = screen.getByRole("button", { name: "Close" });
    last.focus();

    await userEvent.tab();

    // Close is the first focusable element in the panel — it precedes the body.
    expect(document.activeElement).toBe(close);
  });

  it("wraps Shift+Tab from the first focusable element to the last", async () => {
    renderModal();
    await nextTick();

    const last = screen.getByRole("button", { name: "Last" });
    screen.getByRole("button", { name: "Close" }).focus();

    await userEvent.tab({ shift: true });

    expect(document.activeElement).toBe(last);
  });

  it("locks body scroll while open and restores it on close", async () => {
    document.body.style.overflow = "auto";
    const { rerender } = renderModal();
    await nextTick();

    expect(document.body.style.overflow).toBe("hidden");

    await rerender({ open: false });
    await nextTick();

    expect(document.body.style.overflow).toBe("auto");
  });

  it("keeps scroll locked until the last of two nested modals closes", async () => {
    document.body.style.overflow = "auto";
    const outer = renderModal();
    const inner = renderModal();
    await nextTick();

    expect(document.body.style.overflow).toBe("hidden");

    await inner.rerender({ open: false });
    await nextTick();
    expect(document.body.style.overflow).toBe("hidden");

    await outer.rerender({ open: false });
    await nextTick();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("replaces content with a skeleton while loading", () => {
    renderModal({ loading: true });

    const dialog = screen.getByRole("dialog", { name: "Loading dialog" });
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Delete project")).not.toBeInTheDocument();
  });

  it("applies the reader size and never leaves width to the caller", () => {
    renderModal({ size: "reader" });

    expect(screen.getByRole("dialog")).toHaveClass("max-w-3xl");
  });

  it("gives a scrollable body a tab stop and initial focus", async () => {
    renderModal({}, { scrollable: true });
    await nextTick();

    const body = screen.getByRole("dialog").querySelector("[tabindex='0']");
    expect(body).not.toBeNull();
    expect(document.activeElement).toBe(body);
  });

  it("throws when a sub-component is used outside Modal", () => {
    expect(() => render(Modal.Title, { slots: slot(() => "orphan") })).toThrow(
      /must be used within Modal/,
    );
  });
});
