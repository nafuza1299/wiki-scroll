import { computed, type ComputedRef } from "vue";
import { createPersistedStore } from "../lib/storage";
import type { Article } from "../lib/wikipedia/article";

export interface SavedEntry extends Article {
  savedAt: number;
}

interface SavedState {
  entries: SavedEntry[];
}

/*
  The whole card payload is stored, not just the id.

  Storing ids would make opening the saved list N network round-trips before
  anything appears — and the list is the one view that should work instantly.
  Five hundred entries with extracts is roughly 250 KB, comfortable inside a
  ~5 MB budget.
*/
const SAVED_CAP = 500;

function isEntry(value: unknown): value is SavedEntry {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<SavedEntry>;
  return (
    typeof candidate.id === "number" &&
    typeof candidate.title === "string" &&
    typeof candidate.pageUrl === "string"
  );
}

const store = createPersistedStore<SavedState>({
  key: "wiki-scroll:saved",
  version: 1,
  fallback: () => ({ entries: [] }),
  parse: (data) => {
    if (typeof data !== "object" || data === null) return null;
    const entries = (data as { entries?: unknown }).entries;
    if (!Array.isArray(entries)) return null;
    // Anything that no longer matches the shape is dropped rather than
    // discarding the whole list.
    return { entries: entries.filter(isEntry) };
  },
});

export interface SavedArticles {
  /** Newest first. */
  saved: ComputedRef<SavedEntry[]>;
  count: ComputedRef<number>;
  isSaved: (id: number) => boolean;
  toggle: (article: Article) => void;
  remove: (id: number) => void;
  clear: () => void;
}

export function useSavedArticles(): SavedArticles {
  const saved = computed(() =>
    [...store.state.value.entries].sort((a, b) => b.savedAt - a.savedAt),
  );

  function isSaved(id: number): boolean {
    return store.state.value.entries.some((entry) => entry.id === id);
  }

  function toggle(article: Article): void {
    if (isSaved(article.id)) {
      remove(article.id);
      return;
    }
    store.update((previous) => {
      const entries = [...previous.entries, { ...article, savedAt: Date.now() }];
      // Oldest out first once the cap is reached.
      entries.sort((a, b) => a.savedAt - b.savedAt);
      return { entries: entries.slice(Math.max(0, entries.length - SAVED_CAP)) };
    });
  }

  function remove(id: number): void {
    store.update((previous) => ({
      entries: previous.entries.filter((entry) => entry.id !== id),
    }));
  }

  return {
    saved,
    count: computed(() => store.state.value.entries.length),
    isSaved,
    toggle,
    remove,
    clear: () => store.reset(),
  };
}
