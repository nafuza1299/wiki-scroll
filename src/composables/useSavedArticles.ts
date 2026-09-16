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

/*
  Requiring `lang` is what makes a v1 entry (saved before language switching
  existed) get dropped rather than silently mismatch a same-numbered article
  from a different wiki. Bumping v1 to v2 is documentation; this shape check is
  the actual mechanism — a v1 entry has no `lang` field, so it fails here and
  the whole payload falls back to empty via `parse`, same as any other
  corrupt-or-outdated store.
*/
function isEntry(value: unknown): value is SavedEntry {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<SavedEntry>;
  return (
    typeof candidate.id === "number" &&
    typeof candidate.lang === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.pageUrl === "string"
  );
}

const store = createPersistedStore<SavedState>({
  key: "wiki-scroll:saved",
  version: 2,
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
  isSaved: (lang: string, id: number) => boolean;
  toggle: (article: Article) => void;
  remove: (lang: string, id: number) => void;
  clear: () => void;
}

export function useSavedArticles(): SavedArticles {
  const saved = computed(() =>
    [...store.state.value.entries].sort((a, b) => b.savedAt - a.savedAt),
  );

  function isSaved(lang: string, id: number): boolean {
    return store.state.value.entries.some((entry) => entry.lang === lang && entry.id === id);
  }

  function toggle(article: Article): void {
    if (isSaved(article.lang, article.id)) {
      remove(article.lang, article.id);
      return;
    }
    store.update((previous) => {
      const entries = [...previous.entries, { ...article, savedAt: Date.now() }];
      // Oldest out first once the cap is reached.
      entries.sort((a, b) => a.savedAt - b.savedAt);
      return { entries: entries.slice(Math.max(0, entries.length - SAVED_CAP)) };
    });
  }

  function remove(lang: string, id: number): void {
    store.update((previous) => ({
      entries: previous.entries.filter((entry) => !(entry.lang === lang && entry.id === id)),
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
