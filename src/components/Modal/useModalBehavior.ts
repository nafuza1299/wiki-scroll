import { onScopeDispose, watch, type Ref } from "vue";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(", ");

/*
  Module-level on purpose: nested modals share one counter so the inner one
  closing does not restore scrolling while the outer one is still open.
*/
let lockedModalCount = 0;
let originalBodyOverflow = "";

function lockBodyScroll(): void {
  if (lockedModalCount === 0) originalBodyOverflow = document.body.style.overflow;
  lockedModalCount += 1;
  document.body.style.overflow = "hidden";
}

function unlockBodyScroll(): void {
  lockedModalCount = Math.max(0, lockedModalCount - 1);
  if (lockedModalCount === 0) document.body.style.overflow = originalBodyOverflow;
}

function queryFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true",
  );
}

export interface ModalBehaviorOptions {
  open: Ref<boolean>;
  panel: Ref<HTMLElement | null>;
  closeOnEscape: Ref<boolean>;
  requestClose: () => void;
  /** Focused instead of the first focusable child when the dialog opens. */
  initialFocus: Ref<HTMLElement | null>;
}

/**
 * Focus trap, scroll lock, Escape handling, and focus restoration for a dialog.
 * Plain DOM work — it carries over from the React original unchanged apart from
 * the caching below.
 */
export function useModalBehavior(options: ModalBehaviorOptions): void {
  let teardown: (() => void) | null = null;

  function activate(panel: HTMLElement): void {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    /*
      The focusable list is cached rather than re-queried on every Tab. The
      original ran querySelectorAll over the whole panel per keystroke, which is
      fine for a confirmation dialog and wasteful for a reader panel holding
      hundreds of article links. The MutationObserver drops the cache only when
      the subtree actually changes.
    */
    let focusable: HTMLElement[] | null = null;
    const getFocusable = (): HTMLElement[] => (focusable ??= queryFocusable(panel));
    const invalidateCache = new MutationObserver(() => {
      focusable = null;
    });
    invalidateCache.observe(panel, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "tabindex", "aria-hidden", "href"],
    });

    (options.initialFocus.value ?? getFocusable()[0] ?? panel).focus();
    lockBodyScroll();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && options.closeOnEscape.value) {
        event.preventDefault();
        options.requestClose();
        return;
      }
      if (event.key !== "Tab") return;

      const items = getFocusable();
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    teardown = () => {
      document.removeEventListener("keydown", handleKeyDown);
      invalidateCache.disconnect();
      unlockBodyScroll();
      previouslyFocused?.focus();
      teardown = null;
    };
  }

  // flush: "post" so the teleported panel exists in the DOM when this runs, and
  // so document.activeElement is still the trigger when focus is captured.
  watch(
    [options.open, options.panel],
    ([open, panel]) => {
      if (open && panel && !teardown) activate(panel);
      else if (!open && teardown) teardown();
    },
    { flush: "post", immediate: true },
  );

  onScopeDispose(() => teardown?.());
}
