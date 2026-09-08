import type { Article } from "../lib/wikipedia/article";

/*
  The feed's state machine, kept pure and separate from the composable.

  Separating it is what makes the bug this fixes testable without a DOM: the old
  hook had no representation for "the first load failed", so it had nothing to
  render but the skeleton, forever. Every rule below that looks obvious is one
  the previous implementation got wrong.
*/

export type FeedMode =
  { kind: "random" } | { kind: "search"; query: string } | { kind: "related"; title: string };

/** First-page status. `empty` is a success with nothing in it, not a failure. */
export type FeedStatus = "loading" | "ready" | "empty" | "error";

/** Pagination status, tracked apart so a failed page never blanks the feed. */
export type MoreStatus = "idle" | "loading" | "error" | "exhausted";

export interface FeedState {
  mode: FeedMode;
  /** Bumped on every mode change; actions from an older generation are ignored. */
  generation: number;
  articles: Article[];
  status: FeedStatus;
  more: MoreStatus;
  error: string | null;
  activeIndex: number;
}

export type FeedAction =
  | { type: "mode/set"; mode: FeedMode }
  | { type: "page/start"; generation: number; initial: boolean }
  | {
      type: "page/success";
      generation: number;
      initial: boolean;
      articles: Article[];
      exhausted?: boolean;
    }
  | { type: "page/failure"; generation: number; initial: boolean; message: string }
  | { type: "activeIndex/set"; index: number }
  | { type: "activeIndex/step"; delta: number }
  | { type: "article/enrich"; id: number; patch: Partial<Article> };

export function serializeMode(mode: FeedMode): string {
  switch (mode.kind) {
    case "search":
      return `search:${mode.query}`;
    case "related":
      return `related:${mode.title}`;
    default:
      return "random";
  }
}

export function initialFeedState(mode: FeedMode): FeedState {
  return {
    mode,
    generation: 0,
    articles: [],
    status: "loading",
    more: "idle",
    error: null,
    activeIndex: 0,
  };
}

function clamp(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

function appendUnique(existing: Article[], incoming: Article[]): Article[] {
  const known = new Set(existing.map((article) => article.id));
  const added = incoming.filter((article) => {
    if (known.has(article.id)) return false;
    known.add(article.id);
    return true;
  });
  return added.length === 0 ? existing : [...existing, ...added];
}

export function feedReducer(state: FeedState, action: FeedAction): FeedState {
  // A response that arrives after the user has changed mode must not be
  // applied. Abort alone is not enough: a request can already have resolved.
  if ("generation" in action && action.generation !== state.generation) return state;

  switch (action.type) {
    case "mode/set": {
      if (serializeMode(action.mode) === serializeMode(state.mode)) return state;
      return {
        ...initialFeedState(action.mode),
        generation: state.generation + 1,
      };
    }

    case "page/start":
      return action.initial
        ? { ...state, status: "loading", error: null }
        : { ...state, more: "loading" };

    case "page/success": {
      if (action.initial) {
        return {
          ...state,
          articles: action.articles,
          // An empty first page is a legitimate outcome — a search with no
          // matches. It gets its own state so it can say so, rather than
          // rendering a skeleton until the end of time.
          status: action.articles.length === 0 ? "empty" : "ready",
          more: action.exhausted ? "exhausted" : "idle",
          error: null,
          activeIndex: 0,
        };
      }
      const articles = appendUnique(state.articles, action.articles);
      return {
        ...state,
        articles,
        status: "ready",
        more: action.exhausted ? "exhausted" : "idle",
        activeIndex: clamp(state.activeIndex, articles.length),
      };
    }

    case "page/failure":
      return action.initial
        ? { ...state, status: "error", error: action.message }
        : // Articles are deliberately untouched. Failing to load page four is
          // no reason to throw away pages one through three.
          { ...state, more: "error", error: action.message };

    case "activeIndex/set":
      return { ...state, activeIndex: clamp(action.index, state.articles.length) };

    case "activeIndex/step":
      return {
        ...state,
        activeIndex: clamp(state.activeIndex + action.delta, state.articles.length),
      };

    case "article/enrich": {
      let changed = false;
      const articles = state.articles.map((article) => {
        if (article.id !== action.id) return article;
        changed = true;
        return { ...article, ...action.patch };
      });
      return changed ? { ...state, articles } : state;
    }

    default:
      return state;
  }
}
