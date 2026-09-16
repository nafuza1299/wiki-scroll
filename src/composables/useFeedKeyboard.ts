import { onScopeDispose, type Ref } from "vue";

export interface FeedKeyboardHandlers {
  /** False while a dialog owns the keyboard. */
  enabled: Ref<boolean>;
  step: (delta: 1 | -1) => void;
  open: () => void;
  toggleSave: () => void;
  focusSearch: () => void;
  clearSeed: () => void;
  toggleHelp: () => void;
}

const FIELD_SELECTOR = "input, textarea, select, [contenteditable='true']";

/*
  Controls that already do something on Enter. Only Enter consults this list —
  j/k/s must keep working while focus sits on a card, because step() deliberately
  puts it there.

  Without it, `case "Enter": event.preventDefault()` runs for every keypress
  regardless of what has focus, so Enter stops activating the retry button, the
  shortcuts toggle, "Back to random", and every control on a card. Space still
  works, which is what makes it easy to miss.
*/
const ACTIVATABLE_SELECTOR = "button, a[href], summary, [role='button']";

/*
  One document-level listener rather than per-card handlers: the feed is
  scroll-driven, so focus usually sits on <body> and a per-card handler would
  never fire.

  Arrow keys are deliberately NOT bound. They are a keyboard user's only way to
  scroll the page, and hijacking them globally trades a real capability for a
  small convenience. j/k do the same job without taking anything away.

  Modal registers its own document keydown listener for Escape and Tab. Rather
  than racing it with stopPropagation — which depends on registration order and
  is fragile — this handler stands down entirely while a dialog is open, and
  Escape falls through cleanly.
*/
export function useFeedKeyboard(handlers: FeedKeyboardHandlers): void {
  function onKeyDown(event: KeyboardEvent): void {
    if (!handlers.enabled.value) return;
    if (event.defaultPrevented) return;
    // Leave browser and OS shortcuts alone.
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    // Without this, typing "s" in the search box saves an article.
    const target = event.target;
    if (target instanceof Element && target.closest(FIELD_SELECTOR)) return;

    switch (event.key) {
      case "j":
        event.preventDefault();
        handlers.step(1);
        break;
      case "k":
        event.preventDefault();
        handlers.step(-1);
        break;
      case "Enter":
        // Let the focused control have its own Enter. On a card that is the
        // stretched title button, which opens the article anyway — so the
        // shortcut loses nothing, and every other button gets its key back.
        if (target instanceof Element && target.closest(ACTIVATABLE_SELECTOR)) return;
        event.preventDefault();
        handlers.open();
        break;
      case "o":
        event.preventDefault();
        handlers.open();
        break;
      case "s":
        event.preventDefault();
        handlers.toggleSave();
        break;
      case "/":
        // Without preventDefault the slash is typed into the field it focuses.
        event.preventDefault();
        handlers.focusSearch();
        break;
      case "Escape":
        handlers.clearSeed();
        break;
      case "?":
        event.preventDefault();
        handlers.toggleHelp();
        break;
      default:
        break;
    }
  }

  document.addEventListener("keydown", onKeyDown);
  onScopeDispose(() => document.removeEventListener("keydown", onKeyDown));
}
