import { computed, type ComputedRef } from "vue";
import { capFifo, createPersistedStore } from "../lib/storage";

interface SeenState {
  keys: string[];
}

/*
  A recency filter, not a permanent memory — and the UI says so.

  Keyed on "<lang>:<id>", not the bare pageid. Ids are only unique per-wiki: an
  English pageid and a French pageid can be the same number and be unrelated
  articles. Storing the bare id would make a language switch silently exclude
  the wrong article — or fail to exclude one it should — the moment a number
  collided across wikis, which is not a hypothetical, it is guaranteed to
  happen eventually.

  Bumping v1 to v2 is documentation; what actually discards old data is that a
  v1 payload has `ids: number[]`, not `keys: string[]`, so `parse` below simply
  does not recognise it and falls back to empty rather than crashing.

  Five thousand keys is roughly 60 KB (a "lang:id" string is longer than a bare
  number, but still small). Past that the oldest fall out, so a heavy enough
  reader will eventually see a repeat. Calling this "never repeats" would be a
  promise the cap cannot keep.
*/
const SEEN_CAP = 5000;

function seenKey(lang: string, id: number): string {
  return `${lang}:${id}`;
}

const store = createPersistedStore<SeenState>({
  key: "wiki-scroll:seen",
  version: 2,
  fallback: () => ({ keys: [] }),
  parse: (data) => {
    if (typeof data !== "object" || data === null) return null;
    const keys = (data as { keys?: unknown }).keys;
    if (!Array.isArray(keys)) return null;
    return {
      keys: capFifo(
        keys.filter((key): key is string => typeof key === "string"),
        SEEN_CAP,
      ),
    };
  },
});

export interface SeenArticles {
  count: ComputedRef<number>;
  has: (lang: string, id: number) => boolean;
  /** Marked on arrival, not on scroll-past — that is what "do not repeat" needs. */
  remember: (articles: readonly { lang: string; id: number }[]) => void;
  clear: () => void;
}

export function useSeenArticles(): SeenArticles {
  // A Set rebuilt only when the list changes; `has` runs once per candidate
  // article per page, so a linear scan would be the wrong shape.
  const index = computed(() => new Set(store.state.value.keys));

  return {
    count: computed(() => store.state.value.keys.length),
    has: (lang, id) => index.value.has(seenKey(lang, id)),
    remember: (articles) => {
      const known = new Set(store.state.value.keys);
      const additions = articles
        .map((article) => seenKey(article.lang, article.id))
        .filter((key) => !known.has(key));
      if (additions.length === 0) return;
      store.update((previous) => ({
        keys: capFifo([...previous.keys, ...additions], SEEN_CAP),
      }));
    },
    clear: () => store.reset(),
  };
}
