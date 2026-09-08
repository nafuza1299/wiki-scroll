import {
  computed,
  onMounted,
  onScopeDispose,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import { forEachLimit } from "../lib/concurrency";
import type { Article } from "../lib/wikipedia/article";
import {
  enrichArticle,
  loadRandomPage,
  loadRelatedPage,
  loadSearchPage,
  type FeedPageResult,
} from "../lib/wikipedia/feedSource";
import {
  feedReducer,
  initialFeedState,
  serializeMode,
  type FeedAction,
  type FeedMode,
  type FeedState,
} from "./feedReducer";
import { useSeenArticles } from "./useSeenArticles";

const BATCH_SIZE = 10;
const ENRICH_CONCURRENCY = 4;

/**
 * Load the next page this many cards before the end, rather than at the last
 * card — where the old implementation triggered, which is why you reached the
 * bottom and then waited.
 */
const PREFETCH_AHEAD = 3;

/**
 * Injected rather than imported so the feed does not reach into persistence
 * directly — and so its tests are not at the mercy of a real storage backend.
 */
export interface SeenTracker {
  has: (id: number) => boolean;
  remember: (ids: readonly number[]) => void;
}

export interface ArticleFeed {
  articles: ComputedRef<Article[]>;
  status: ComputedRef<FeedState["status"]>;
  more: ComputedRef<FeedState["more"]>;
  error: ComputedRef<string | null>;
  activeIndex: ComputedRef<number>;
  retry: () => void;
  loadMore: () => void;
  registerCard: (index: number) => (target: unknown) => void;
}

/**
 * A template ref hands back an element for a plain tag and a component instance
 * for a component. Resolving both here keeps callers from having to adapt, which
 * is what previously forced a fresh closure per render.
 */
function resolveElement(target: unknown): Element | null {
  if (target instanceof Element) return target;
  const element = (target as { $el?: unknown } | null)?.$el;
  return element instanceof Element ? element : null;
}

export function useArticleFeed(
  mode: Ref<FeedMode>,
  options: { seen?: SeenTracker } = {},
): ArticleFeed {
  const seen = options.seen ?? useSeenArticles();

  // shallowRef plus whole-state replacement: the reducer already returns new
  // objects, so deep reactivity would proxy every Article for nothing.
  const state = shallowRef<FeedState>(initialFeedState(mode.value));

  function dispatch(action: FeedAction): void {
    state.value = feedReducer(state.value, action);
  }

  let controller: AbortController | null = null;
  let searchOffset = 0;
  let observer: IntersectionObserver | null = null;

  const indexOfElement = new WeakMap<Element, number>();
  const elementOfIndex = new Map<number, Element>();
  const refCallbacks = new Map<number, (target: unknown) => void>();

  function enrich(page: readonly Article[], signal: AbortSignal, generation: number): void {
    void forEachLimit(page, ENRICH_CONCURRENCY, async (article) => {
      const patch = await enrichArticle(article.title, signal);
      if (signal.aborted || state.value.generation !== generation) return;
      dispatch({ type: "article/enrich", id: article.id, patch });
    }).catch(() => {
      // Enrichment is decoration. Cards stand as they are.
    });
  }

  /** Everything already on screen, plus everything read recently. */
  function excluded(): (id: number) => boolean {
    const onScreen = new Set(state.value.articles.map((article) => article.id));
    return (id) => onScreen.has(id) || seen.has(id);
  }

  /**
   * Search results are the one mode the reading-history filter must not touch:
   * hiding a match because it was scrolled past last week would look like the
   * search is broken.
   */
  function excludedForSearch(): (id: number) => boolean {
    const onScreen = new Set(state.value.articles.map((article) => article.id));
    return (id) => onScreen.has(id);
  }

  function loadPage(
    current: FeedMode,
    initial: boolean,
    signal: AbortSignal,
  ): Promise<FeedPageResult> {
    switch (current.kind) {
      case "search":
        return loadSearchPage({
          query: current.query,
          size: BATCH_SIZE,
          offset: initial ? 0 : searchOffset,
          signal,
          exclude: excludedForSearch(),
        });
      case "related":
        return loadRelatedPage({
          title: current.title,
          size: BATCH_SIZE,
          signal,
          exclude: excludedForSearch(),
        });
      default:
        return loadRandomPage({ size: BATCH_SIZE, signal, exclude: excluded() });
    }
  }

  async function load(initial: boolean): Promise<void> {
    if (!controller || controller.signal.aborted) controller = new AbortController();
    const { signal } = controller;
    const generation = state.value.generation;

    dispatch({ type: "page/start", generation, initial });

    try {
      const page = await loadPage(mode.value, initial, signal);
      if (signal.aborted) return;
      searchOffset = page.nextOffset ?? searchOffset;
      // Marked on arrival rather than on scroll-past: that is what makes a
      // refresh continue where it left off instead of re-serving the same page.
      seen.remember(page.articles.map((article) => article.id));
      dispatch({
        type: "page/success",
        generation,
        initial,
        articles: page.articles,
        exhausted: page.exhausted,
      });
      enrich(page.articles, signal, generation);
    } catch (error) {
      // A cancelled request is not a failure to report — the user moved on.
      if (error instanceof Error && error.name === "AbortError") return;
      if (signal.aborted) return;
      dispatch({
        type: "page/failure",
        generation,
        initial,
        message: error instanceof Error ? error.message : "Something went wrong.",
      });
    }
  }

  function loadMore(): void {
    const { status, more } = state.value;
    if (status !== "ready") return;
    // Re-entrancy guard: scrolling fires the observer far more often than a
    // page can load.
    if (more === "loading" || more === "exhausted") return;
    void load(false);
  }

  function retry(): void {
    void load(state.value.status === "error");
  }

  onMounted(() => {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = indexOfElement.get(entry.target);
          if (index !== undefined) dispatch({ type: "activeIndex/set", index });
        }
      },
      // Start the next page while the previous one is still on screen.
      { threshold: 0.5, rootMargin: "0px 0px 400px 0px" },
    );
    void load(true);
  });

  watch(
    // Keyed on a stable string so an inline object literal does not retrigger.
    () => serializeMode(mode.value),
    () => {
      controller?.abort();
      controller = new AbortController();
      searchOffset = 0;
      dispatch({ type: "mode/set", mode: mode.value });
      void load(true);
    },
  );

  watch(
    () => [state.value.activeIndex, state.value.articles.length, state.value.more] as const,
    ([activeIndex, length]) => {
      if (length === 0) return;
      if (activeIndex >= length - PREFETCH_AHEAD) loadMore();
    },
  );

  onScopeDispose(() => {
    controller?.abort();
    observer?.disconnect();
    elementOfIndex.clear();
    refCallbacks.clear();
  });

  /*
    One stable callback per index. Returning a fresh closure each render would
    make Vue tear the ref down and set it up again on every update, which is
    both wasted work and a good way to lose observations.
  */
  function registerCard(index: number): (target: unknown) => void {
    let callback = refCallbacks.get(index);
    if (callback) return callback;

    callback = (target: unknown): void => {
      const element = resolveElement(target);
      if (element) {
        indexOfElement.set(element, index);
        elementOfIndex.set(index, element);
        observer?.observe(element);
        return;
      }
      // Vue passes null on unmount. The old implementation had no equivalent
      // branch at all, so observations accumulated for the whole session.
      const previous = elementOfIndex.get(index);
      if (previous) {
        observer?.unobserve(previous);
        elementOfIndex.delete(index);
      }
    };

    refCallbacks.set(index, callback);
    return callback;
  }

  return {
    articles: computed(() => state.value.articles),
    status: computed(() => state.value.status),
    more: computed(() => state.value.more),
    error: computed(() => state.value.error),
    activeIndex: computed(() => state.value.activeIndex),
    retry,
    loadMore,
    registerCard,
  };
}
