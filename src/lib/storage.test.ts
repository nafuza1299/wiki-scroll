import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capFifo, createPersistedStore, resetStorageBackend } from "./storage";

interface Counter {
  n: number;
}

const KEY = "wiki-scroll:test";

function makeStore() {
  return createPersistedStore<Counter>({
    key: KEY,
    version: 1,
    fallback: () => ({ n: 0 }),
    parse: (data) => {
      if (typeof data !== "object" || data === null) return null;
      const n = (data as { n?: unknown }).n;
      return typeof n === "number" ? { n } : null;
    },
  });
}

beforeEach(() => resetStorageBackend());
afterEach(() => {
  vi.restoreAllMocks();
  resetStorageBackend();
});

describe("createPersistedStore", () => {
  it("round-trips through storage", () => {
    makeStore().set({ n: 7 });

    expect(makeStore().state.value).toEqual({ n: 7 });
  });

  it("starts from the fallback when nothing is stored", () => {
    expect(makeStore().state.value).toEqual({ n: 0 });
  });

  it("gives each store its own fallback object", () => {
    expect(makeStore().state.value).not.toBe(makeStore().state.value);
  });

  it("updates from the previous value", () => {
    const store = makeStore();
    store.set({ n: 1 });
    store.update((previous) => ({ n: previous.n + 41 }));

    expect(store.state.value).toEqual({ n: 42 });
    expect(makeStore().state.value).toEqual({ n: 42 });
  });

  it("resets both memory and storage", () => {
    const store = makeStore();
    store.set({ n: 5 });
    store.reset();

    expect(store.state.value).toEqual({ n: 0 });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  /*
    A read must never throw. Anything at all can be sitting under this key — a
    half-written value, something from a much older build, or another app's data
    on a shared origin.
  */
  it("falls back on corrupt JSON rather than throwing", () => {
    localStorage.setItem(KEY, "{not json");

    expect(makeStore().state.value).toEqual({ n: 0 });
  });

  it("falls back when the envelope is not an envelope", () => {
    localStorage.setItem(KEY, JSON.stringify({ hello: "world" }));

    expect(makeStore().state.value).toEqual({ n: 0 });
  });

  it("falls back when the payload no longer parses", () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, data: { n: "not a number" } }));

    expect(makeStore().state.value).toEqual({ n: 0 });
  });

  it("hands the stored version to parse so it can migrate or discard", () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 0, data: { legacy: 3 } }));

    const store = createPersistedStore<Counter>({
      key: KEY,
      version: 1,
      fallback: () => ({ n: 0 }),
      parse: (data, version) => (version === 0 ? { n: (data as { legacy: number }).legacy } : null),
    });

    expect(store.state.value).toEqual({ n: 3 });
  });

  /*
    A write must never throw either. Quota exhaustion loses a bookmark; letting
    it propagate loses the app.
  */
  it("survives a quota error and keeps the value in memory", () => {
    const store = makeStore();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(() => store.set({ n: 9 })).not.toThrow();
    expect(store.state.value).toEqual({ n: 9 });
    expect(store.degraded).toBe(true);
  });

  /*
    Safari private mode allows reads and throws on write, so a read-only probe
    would wrongly report storage as available.
  */
  it("degrades to memory when storage rejects writes entirely", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    const store = makeStore();
    expect(() => store.set({ n: 4 })).not.toThrow();
    expect(store.state.value).toEqual({ n: 4 });
  });

  it("picks up a write from another tab", () => {
    const store = makeStore();
    localStorage.setItem(KEY, JSON.stringify({ v: 1, data: { n: 11 } }));

    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));

    expect(store.state.value).toEqual({ n: 11 });
  });
});

describe("capFifo", () => {
  it("leaves a short list alone", () => {
    expect(capFifo([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it("drops the oldest entries past the cap", () => {
    expect(capFifo([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
  });

  it("copies rather than aliasing the input", () => {
    const input = [1, 2];
    expect(capFifo(input, 5)).not.toBe(input);
  });
});
