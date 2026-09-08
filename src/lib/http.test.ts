import { afterEach, describe, expect, it } from "vitest";
import { clearHttpCaches, fetchJson, HttpError } from "./http";
import { errorResponse, fetchCalls, jsonResponse, mockRoute } from "../test/fetchMock";

afterEach(() => clearHttpCaches());

const URL_A = "https://example.test/a";

describe("fetchJson caching and deduplication", () => {
  it("collapses concurrent requests for the same URL into one fetch", async () => {
    mockRoute("/a", () => jsonResponse({ n: 1 }));

    const [first, second] = await Promise.all([
      fetchJson<{ n: number }>(URL_A),
      fetchJson<{ n: number }>(URL_A),
    ]);

    expect(first).toEqual({ n: 1 });
    expect(second).toEqual({ n: 1 });
    expect(fetchCalls()).toHaveLength(1);
  });

  it("serves a second request from cache within the TTL", async () => {
    mockRoute("/a", () => jsonResponse({ n: 1 }));

    await fetchJson(URL_A);
    await fetchJson(URL_A);

    expect(fetchCalls()).toHaveLength(1);
  });

  it("re-fetches once the TTL has elapsed", async () => {
    mockRoute("/a", () => jsonResponse({ n: 1 }));

    await fetchJson(URL_A, { ttlMs: 0 });
    await fetchJson(URL_A, { ttlMs: 0 });

    expect(fetchCalls()).toHaveLength(2);
  });

  /*
    Random endpoints share one URL but must yield different results, so bypass
    has to skip in-flight sharing as well as the cache. Without this, a batch of
    ten random articles collapses into one article ten times.
  */
  it("never shares or caches a bypass request", async () => {
    let n = 0;
    mockRoute("/a", () => jsonResponse({ n: (n += 1) }));

    const results = await Promise.all([
      fetchJson<{ n: number }>(URL_A, { cache: "bypass" }),
      fetchJson<{ n: number }>(URL_A, { cache: "bypass" }),
    ]);

    expect(fetchCalls()).toHaveLength(2);
    expect(new Set(results.map((r) => r.n)).size).toBe(2);
  });
});

describe("fetchJson retries", () => {
  it("retries a 503 and returns the eventual success", async () => {
    let attempts = 0;
    mockRoute("/a", () => {
      attempts += 1;
      return attempts === 1 ? errorResponse(503) : jsonResponse({ ok: true });
    });

    await expect(fetchJson(URL_A)).resolves.toEqual({ ok: true });
    expect(attempts).toBe(2);
  });

  it("does not retry a 404", async () => {
    let attempts = 0;
    mockRoute("/a", () => {
      attempts += 1;
      return errorResponse(404);
    });

    await expect(fetchJson(URL_A)).rejects.toBeInstanceOf(HttpError);
    expect(attempts).toBe(1);
  });

  it("gives up after the configured number of retries", async () => {
    let attempts = 0;
    mockRoute("/a", () => {
      attempts += 1;
      return errorResponse(500);
    });

    await expect(fetchJson(URL_A, { retries: 1 })).rejects.toMatchObject({ status: 500 });
    expect(attempts).toBe(2);
  });

  it("honours Retry-After on a 429", async () => {
    let attempts = 0;
    mockRoute("/a", () => {
      attempts += 1;
      return attempts === 1
        ? errorResponse(429, { headers: { "retry-after": "0" } })
        : jsonResponse({ ok: true });
    });

    await expect(fetchJson(URL_A)).resolves.toEqual({ ok: true });
    expect(attempts).toBe(2);
  });
});

describe("fetchJson cancellation", () => {
  it("rejects the caller that aborted", async () => {
    mockRoute(
      "/a",
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(jsonResponse({})), 30)),
    );
    const controller = new AbortController();

    const pending = fetchJson(URL_A, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  /*
    The subtle one. Two components can await the same URL; one unmounting must
    not cancel the request the other is still waiting on. Get this wrong and the
    symptom is an intermittent failure nobody can reproduce.
  */
  it("keeps a shared request alive when only one of two callers aborts", async () => {
    mockRoute(
      "/a",
      () =>
        new Promise<Response>((resolve) => setTimeout(() => resolve(jsonResponse({ n: 7 })), 30)),
    );
    const leaving = new AbortController();
    const staying = new AbortController();

    const abandoned = fetchJson(URL_A, { signal: leaving.signal });
    const kept = fetchJson<{ n: number }>(URL_A, { signal: staying.signal });
    leaving.abort();

    await expect(abandoned).rejects.toMatchObject({ name: "AbortError" });
    await expect(kept).resolves.toEqual({ n: 7 });
    expect(fetchCalls()).toHaveLength(1);
  });

  it("aborts the underlying request once every caller has dropped", async () => {
    let sawAbort = false;
    mockRoute(
      "/a",
      ({ init }) =>
        new Promise<Response>((resolve, reject) => {
          const timer = setTimeout(() => resolve(jsonResponse({})), 50);
          init?.signal?.addEventListener("abort", () => {
            sawAbort = true;
            clearTimeout(timer);
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const first = new AbortController();
    const second = new AbortController();

    const a = fetchJson(URL_A, { signal: first.signal });
    const b = fetchJson(URL_A, { signal: second.signal });
    first.abort();
    second.abort();

    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    await expect(b).rejects.toMatchObject({ name: "AbortError" });
    expect(sawAbort).toBe(true);
  });
});
