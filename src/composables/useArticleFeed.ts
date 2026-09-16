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
import { isAbortError } from "../lib/http";
import type { Article } from "../lib/wikipedia/article";
import {
  enrichArticle,
  loadCategoryPage,
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
 *
 * Keyed on (lang, id) pairs, not bare ids: a pageid is only unique per-wiki,
 * so a bare-id tracker would silently misreport across a language switch.
 */
export interface SeenTracker {
  has: (lang: string, id: number) => boolean;
  remember: (articles: readonly { lang: string; id: number }[]) => void;
}

export interface ArticleFeed {
  articles: ComputedRef<Article[]>;
  status: ComputedRef<FeedState["status"]>;
  more: ComputedRef<FeedState["more"]>;
  error: ComputedRef<string | null>;
  activeIndex: ComputedRef<number>;
  retry: () => void;
  loadMore: () => void;
  /** Moves the active card and takes focus with it. */
  step: (delta: 1 | -1) => void;
  /** The article the keyboard is currently on, if any. */
  activeArticle: () => Article | null;
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
  lang: Ref<string>,
  options: { seen?: SeenTracker } = {},
): ArticleFeed {
  const seen = options.seen ?? useSeenArticles();

  // shallowRef plus whole-state replacement: the reducer already returns new
  // objects, so deep reactivity would proxy every Article for nothing.
  const state = shallowRef<FeedState>(initialFeedState(mode.value, lang.value));

  function dispatch(action: FeedAction): void {
    state.value = feedReducer(state.value, action);
  }

  let controller: AbortController | null = null;
  let searchOffset = 0;
  let categoryCursor: string | undefined;
  /*
    step() scrolls smoothly, and the observer fires for every card passed on the
    way, each one overwriting activeIndex. Without this guard, pressing j once
    lands somewhere other than the next card.
  */
  let suppressObserverUntil = 0;
  let observer: IntersectionObserver | null = null;

  const indexOfElement = new WeakMap<Element, number>();
  const elementOfIndex = new Map<number, Element>();
  const refCallbacks = new Map<number, (target: unknown) => void>();

  function enrich(page: readonly Article[], signal: AbortSignal, generation: number): void {
    void forEachLimit(page, ENRICH_CONCURRENCY, async (article) => {
      // The article's own lang, not the outer ref: correct even if the user
      // switches language again mid-enrichment, and the generation guard below
      // already handles that race at the dispatch level regardless.
      const patch = await enrichArticle(article.lang, article.title, signal);
      if (signal.aborted || state.value.generation !== generation) return;
      dispatch({ type: "article/enrich", id: article.id, patch });
    }).catch(() => {
      // Enrichment is decoration. Cards stand as they are.
    });
  }

  /**
   * Everything already on screen, plus everything read recently.
   *
   * The on-screen half stays id-only on purpose: at any moment `articles` only
   * ever holds one language's cards, because a language change always resets
   * the feed (see the watch below) — so a same-numbered article from another
   * wiki is never actually on screen to collide with. Only the persisted seen
   * history spans languages, which is why that half needs the composite key.
   */
  function excluded(): (id: number) => boolean {
    const onScreen = new Set(state.value.articles.map((article) => article.id));
    return (id) => onScreen.has(id) || seen.has(lang.value, id);
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
          lang: lang.value,
          query: current.query,
          size: BATCH_SIZE,
          offset: initial ? 0 : searchOffset,
          signal,
          exclude: excludedForSearch(),
        });
      case "related":
        return loadRelatedPage({
          lang: lang.value,
          title: current.title,
          size: BATCH_SIZE,
          signal,
          exclude: excludedForSearch(),
        });
      case "category":
        return loadCategoryPage({
          lang: lang.value,
          name: current.name,
          size: BATCH_SIZE,
          cursor: initial ? undefined : categoryCursor,
          signal,
          exclude: excludedForSearch(),
        });
      default:
        return loadRandomPage({ lang: lang.value, size: BATCH_SIZE, signal, exclude: excluded() });
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
      categoryCursor = page.nextCursor ?? categoryCursor;
      // Marked on arrival rather than on scroll-past: that is what makes a
      // refresh continue where it left off instead of re-serving the same page.
      seen.remember(page.articles.map((article) => ({ lang: article.lang, id: article.id })));
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
      if (isAbortError(error)) return;
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
          if (Date.now() < suppressObserverUntil) continue;
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
    // Keyed on lang plus a stable mode string, not mode alone: switching
    // language while staying in "random" mode must still reset the feed, and
    // serializeMode("random") is the same string before and after — the
    // reducer's own no-op guard has the identical reasoning, see feedReducer.ts.
    () => `${lang.value}:${serializeMode(mode.value)}`,
    () => {
      controller?.abort();
      controller = new AbortController();
      searchOffset = 0;
      categoryCursor = undefined;
      dispatch({ type: "mode/set", mode: mode.value, lang: lang.value });
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

  function activeArticle(): Article | null {
    return state.value.articles[state.value.activeIndex] ?? null;
  }

  /**
   * Moves DOM focus as well as the index. Without the focus move, j/k give a
   * screen-reader user no feedback at all — the page scrolls and nothing is
   * announced.
   */
  function step(delta: 1 | -1): void {
    if (state.value.articles.length === 0) return;
    dispatch({ type: "activeIndex/step", delta });

    const element = elementOfIndex.get(state.value.activeIndex);
    if (!element) return;

    const focusable = element.querySelector<HTMLElement>("button, a[href]") ?? null;
    focusable?.focus({ preventScroll: true });

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    element.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    suppressObserverUntil = Date.now() + 600;
  }

  return {
    articles: computed(() => state.value.articles),
    status: computed(() => state.value.status),
    more: computed(() => state.value.more),
    error: computed(() => state.value.error),
    activeIndex: computed(() => state.value.activeIndex),
    retry,
    loadMore,
    step,
    activeArticle,
    registerCard,
  };
}
