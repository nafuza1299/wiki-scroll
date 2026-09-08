import { computed, ref, type ComputedRef } from "vue";

export type Theme = "light" | "dark";

const STORAGE_KEY = "wiki-scroll:theme";

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    // Private mode, disabled storage. A theme is not worth throwing over.
    return null;
  }
}

function persistTheme(next: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // As above — the attribute still applies, the choice just will not survive.
  }
}

/*
  The ordering here is the contract, not a preference.

  [data-theme] is read FIRST, because index.html sets it from a blocking script
  before anything paints. Reading it back is what makes the app's first render
  agree with markup that is already on screen: no flash, and under SSR no
  hydration mismatch. The attribute is what is currently *true*; localStorage is
  where the choice is *persisted*. Do not reorder these.

  The `document` guard is what makes this callable on a server at all.
*/
export function resolveInitialTheme(): Theme {
  if (typeof document === "undefined") return "light";

  const attribute = document.documentElement.dataset.theme;
  if (attribute === "light" || attribute === "dark") return attribute;

  const stored = readStoredTheme();
  if (stored) return stored;

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const current = ref<Theme>(resolveInitialTheme());

export function setTheme(next: Theme): void {
  current.value = next;
  if (typeof document !== "undefined") document.documentElement.dataset.theme = next;
  persistTheme(next);
}

export function toggleTheme(): void {
  setTheme(current.value === "dark" ? "light" : "dark");
}

/**
 * App-wide singleton — there is one theme, so there is one piece of state. No
 * provider, and no per-component theme prop; `[data-theme]` on `<html>` remains
 * the only theming mechanism.
 */
export function useTheme(): {
  theme: ComputedRef<Theme>;
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
} {
  return { theme: computed(() => current.value), setTheme, toggleTheme };
}
