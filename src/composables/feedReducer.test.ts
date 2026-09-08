import { describe, expect, it } from "vitest";
import { feedReducer, initialFeedState, serializeMode, type FeedState } from "./feedReducer";
import type { Article } from "../lib/wikipedia/article";

function article(id: number): Article {
  return {
    id,
    title: `Article ${id}`,
    extract: "",
    thumbnailUrl: null,
    pageUrl: `https://en.wikipedia.org/wiki/Article_${id}`,
    createdAt: null,
    lastEdited: null,
    viewCount30d: null,
  };
}

function ready(articles = [article(1), article(2)]): FeedState {
  return feedReducer(initialFeedState({ kind: "random" }), {
    type: "page/success",
    generation: 0,
    initial: true,
    articles,
  });
}

describe("serializeMode", () => {
  it("distinguishes every mode", () => {
    expect(serializeMode({ kind: "random" })).toBe("random");
    expect(serializeMode({ kind: "search", query: "cats" })).toBe("search:cats");
    expect(serializeMode({ kind: "related", title: "Cat" })).toBe("related:Cat");
  });
});

describe("first page", () => {
  it("starts in loading", () => {
    expect(initialFeedState({ kind: "random" }).status).toBe("loading");
  });

  it("becomes ready with articles", () => {
    const state = ready();
    expect(state.status).toBe("ready");
    expect(state.articles).toHaveLength(2);
  });

  /*
    The bug this whole state machine exists to kill. A failed first load had no
    representation, so the app rendered its skeleton forever.
  */
  it("becomes an error state when the first load fails", () => {
    const state = feedReducer(initialFeedState({ kind: "random" }), {
      type: "page/failure",
      generation: 0,
      initial: true,
      message: "Could not reach Wikipedia.",
    });

    expect(state.status).toBe("error");
    expect(state.error).toBe("Could not reach Wikipedia.");
  });

  it("distinguishes an empty result from a failure", () => {
    const state = feedReducer(initialFeedState({ kind: "random" }), {
      type: "page/success",
      generation: 0,
      initial: true,
      articles: [],
    });

    expect(state.status).toBe("empty");
    expect(state.error).toBeNull();
  });

  it("clears a previous error when a retry starts", () => {
    const failed = feedReducer(initialFeedState({ kind: "random" }), {
      type: "page/failure",
      generation: 0,
      initial: true,
      message: "boom",
    });

    const retrying = feedReducer(failed, { type: "page/start", generation: 0, initial: true });

    expect(retrying.status).toBe("loading");
    expect(retrying.error).toBeNull();
  });
});

describe("pagination", () => {
  it("appends and stays ready", () => {
    const state = feedReducer(ready(), {
      type: "page/success",
      generation: 0,
      initial: false,
      articles: [article(3)],
    });

    expect(state.articles.map((a) => a.id)).toEqual([1, 2, 3]);
    expect(state.more).toBe("idle");
  });

  it("drops duplicates on append", () => {
    const state = feedReducer(ready(), {
      type: "page/success",
      generation: 0,
      initial: false,
      articles: [article(2), article(3), article(3)],
    });

    expect(state.articles.map((a) => a.id)).toEqual([1, 2, 3]);
  });

  /*
    Failing to load page four is no reason to throw away pages one to three.
    The old code additionally left its in-flight flags set, which killed
    pagination for the rest of the session.
  */
  it("keeps existing articles when a later page fails", () => {
    const state = feedReducer(ready(), {
      type: "page/failure",
      generation: 0,
      initial: false,
      message: "offline",
    });

    expect(state.status).toBe("ready");
    expect(state.more).toBe("error");
    expect(state.articles).toHaveLength(2);
  });

  it("marks the feed exhausted when told so", () => {
    const state = feedReducer(ready(), {
      type: "page/success",
      generation: 0,
      initial: false,
      articles: [],
      exhausted: true,
    });

    expect(state.more).toBe("exhausted");
  });
});

describe("generations", () => {
  it("ignores a response from a superseded mode", () => {
    const switched = feedReducer(ready(), {
      type: "mode/set",
      mode: { kind: "search", query: "cats" },
    });

    const stale = feedReducer(switched, {
      type: "page/success",
      generation: 0,
      initial: true,
      articles: [article(9)],
    });

    expect(stale).toBe(switched);
    expect(stale.articles).toHaveLength(0);
  });

  it("clears the feed and bumps the generation on a mode change", () => {
    const switched = feedReducer(ready(), {
      type: "mode/set",
      mode: { kind: "search", query: "cats" },
    });

    expect(switched.generation).toBe(1);
    expect(switched.articles).toHaveLength(0);
    expect(switched.status).toBe("loading");
  });

  it("is a no-op when the mode has not actually changed", () => {
    const state = ready();
    expect(feedReducer(state, { type: "mode/set", mode: { kind: "random" } })).toBe(state);
  });
});

describe("activeIndex", () => {
  it("clamps to the bounds of the list", () => {
    const state = ready();

    expect(feedReducer(state, { type: "activeIndex/set", index: 99 }).activeIndex).toBe(1);
    expect(feedReducer(state, { type: "activeIndex/set", index: -5 }).activeIndex).toBe(0);
  });

  it("stays at zero for an empty feed", () => {
    const empty = initialFeedState({ kind: "random" });
    expect(feedReducer(empty, { type: "activeIndex/set", index: 4 }).activeIndex).toBe(0);
  });
});

describe("enrichment", () => {
  it("patches a single article in place", () => {
    const state = feedReducer(ready(), {
      type: "article/enrich",
      id: 2,
      patch: { viewCount30d: 1234, createdAt: "2010-01-01T00:00:00Z" },
    });

    expect(state.articles[1].viewCount30d).toBe(1234);
    expect(state.articles[0].viewCount30d).toBeNull();
  });

  it("is a no-op for an article that is no longer in the feed", () => {
    const state = ready();
    expect(feedReducer(state, { type: "article/enrich", id: 404, patch: {} })).toBe(state);
  });
});
