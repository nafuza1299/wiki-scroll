import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { render } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { useFeedKeyboard } from "./useFeedKeyboard";

function mountKeyboard(enabled = ref(true)) {
  const handlers = {
    enabled,
    step: vi.fn(),
    open: vi.fn(),
    toggleSave: vi.fn(),
    focusSearch: vi.fn(),
    clearSeed: vi.fn(),
    toggleHelp: vi.fn(),
  };

  const Harness = defineComponent({
    setup() {
      useFeedKeyboard(handlers);
      return () => h("div", [h("input", { type: "search" }), h("button", "card")]);
    },
  });

  return { ...render(Harness), handlers, enabled };
}

describe("useFeedKeyboard", () => {
  it("moves between articles with j and k", async () => {
    const { handlers } = mountKeyboard();

    await userEvent.keyboard("j");
    await userEvent.keyboard("k");

    expect(handlers.step).toHaveBeenNthCalledWith(1, 1);
    expect(handlers.step).toHaveBeenNthCalledWith(2, -1);
  });

  it("opens with Enter and with o", async () => {
    const { handlers } = mountKeyboard();

    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("o");

    expect(handlers.open).toHaveBeenCalledTimes(2);
  });

  it("saves with s, focuses search with /, and shows help with ?", async () => {
    const { handlers } = mountKeyboard();

    await userEvent.keyboard("s");
    await userEvent.keyboard("/");
    await userEvent.keyboard("?");

    expect(handlers.toggleSave).toHaveBeenCalledTimes(1);
    expect(handlers.focusSearch).toHaveBeenCalledTimes(1);
    expect(handlers.toggleHelp).toHaveBeenCalledTimes(1);
  });

  it("clears the seed with Escape", async () => {
    const { handlers } = mountKeyboard();

    await userEvent.keyboard("{Escape}");

    expect(handlers.clearSeed).toHaveBeenCalledTimes(1);
  });

  /*
    Without this guard, typing "s" into the search box saves an article and
    typing "j" scrolls the feed.
  */
  it("stays out of the way while a text field has focus", async () => {
    const { handlers, container } = mountKeyboard();
    const input = container.querySelector("input");
    input?.focus();

    await userEvent.keyboard("just some search text");

    expect(handlers.step).not.toHaveBeenCalled();
    expect(handlers.toggleSave).not.toHaveBeenCalled();
    expect(handlers.open).not.toHaveBeenCalled();
  });

  /*
    Modal registers its own document keydown listener. Rather than race it with
    stopPropagation, which depends on registration order, this handler stands
    down entirely so Escape falls through to the dialog.
  */
  it("is inert while a dialog owns the keyboard", async () => {
    const enabled = ref(false);
    const { handlers } = mountKeyboard(enabled);

    await userEvent.keyboard("j");
    await userEvent.keyboard("{Escape}");
    expect(handlers.step).not.toHaveBeenCalled();
    expect(handlers.clearSeed).not.toHaveBeenCalled();

    enabled.value = true;
    await userEvent.keyboard("j");
    expect(handlers.step).toHaveBeenCalledTimes(1);
  });

  it("leaves browser and OS shortcuts alone", async () => {
    const { handlers } = mountKeyboard();

    await userEvent.keyboard("{Control>}j{/Control}");
    await userEvent.keyboard("{Meta>}s{/Meta}");

    expect(handlers.step).not.toHaveBeenCalled();
    expect(handlers.toggleSave).not.toHaveBeenCalled();
  });

  /*
    Arrow keys are a keyboard user's only way to scroll the page. Binding them
    globally would trade a real capability for a small convenience.
  */
  it("does not hijack the arrow keys", async () => {
    const { handlers } = mountKeyboard();

    await userEvent.keyboard("{ArrowDown}{ArrowUp}");

    expect(handlers.step).not.toHaveBeenCalled();
  });

  it("stops listening once unmounted", async () => {
    const { handlers, unmount } = mountKeyboard();
    unmount();

    await userEvent.keyboard("j");

    expect(handlers.step).not.toHaveBeenCalled();
  });
});
