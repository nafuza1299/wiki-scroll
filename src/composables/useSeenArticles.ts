import { computed, type ComputedRef } from "vue";
import { capFifo, createPersistedStore } from "../lib/storage";

interface SeenState {
  ids: number[];
}

/*
  A recency filter, not a permanent memory — and the UI says so.

  Page ids are stored rather than titles: they are stable, compact, and already
  the natural key. Five thousand of them is roughly 40 KB. Past that the oldest
  fall out, so a heavy enough reader will eventually see a repeat. Calling this
  "never repeats" would be a promise the cap cannot keep.
*/
const SEEN_CAP = 5000;

const store = createPersistedStore<SeenState>({
  key: "wiki-scroll:seen",
  version: 1,
  fallback: () => ({ ids: [] }),
  parse: (data) => {
    if (typeof data !== "object" || data === null) return null;
    const ids = (data as { ids?: unknown }).ids;
    if (!Array.isArray(ids)) return null;
    return {
      ids: capFifo(
        ids.filter((id): id is number => typeof id === "number"),
        SEEN_CAP,
      ),
    };
  },
});

export interface SeenArticles {
  count: ComputedRef<number>;
  has: (id: number) => boolean;
  /** Marked on arrival, not on scroll-past — that is what "do not repeat" needs. */
  remember: (ids: readonly number[]) => void;
  clear: () => void;
}

export function useSeenArticles(): SeenArticles {
  // A Set rebuilt only when the list changes; `has` runs once per candidate
  // article per page, so a linear scan would be the wrong shape.
  const index = computed(() => new Set(store.state.value.ids));

  return {
    count: computed(() => store.state.value.ids.length),
    has: (id) => index.value.has(id),
    remember: (ids) => {
      const known = new Set(store.state.value.ids);
      const additions = ids.filter((id) => !known.has(id));
      if (additions.length === 0) return;
      store.update((previous) => ({
        ids: capFifo([...previous.ids, ...additions], SEEN_CAP),
      }));
    },
    clear: () => store.reset(),
  };
}
