import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { render, screen } from "@testing-library/vue";
import { errorResponse, fetchCalls, jsonResponse, mockJson, mockRoute } from "./fetchMock";
import { intersect, observedElements } from "./observerMock";

/*
  These stubs are load-bearing for every later phase — the feed cannot be tested
  without a controllable IntersectionObserver, and the HTTP layer's cancellation
  cannot be tested against a fetch mock that ignores AbortSignal. Test the
  tooling, so a broken harness fails here rather than as a confusing failure in
  the suite that depends on it.
*/

describe("vue + jsdom harness", () => {
  it("renders a component and queries it by role", () => {
    const Greeting = defineComponent({
      props: { name: { type: String, required: true } },
      setup: (props) => () => h("button", { type: "button" }, `Hello ${props.name}`),
    });

    render(Greeting, { props: { name: "wiki-scroll" } });

    expect(screen.getByRole("button")).toHaveTextContent("Hello wiki-scroll");
  });
});

describe("fetchMock", () => {
  it("routes by substring and records calls", async () => {
    mockJson("/api/thing", { ok: true });

    const response = await fetch("https://example.test/api/thing?x=1");

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(fetchCalls()).toEqual(["https://example.test/api/thing?x=1"]);
  });

  it("lets a later registration override an earlier one", async () => {
    mockJson("/api/thing", { which: "first" });
    mockJson("/api/thing", { which: "second" });

    const response = await fetch("https://example.test/api/thing");

    await expect(response.json()).resolves.toEqual({ which: "second" });
  });

  it("throws a descriptive error when no route matches", async () => {
    await expect(fetch("https://example.test/unrouted")).rejects.toThrow(/no route matched/);
  });

  it("surfaces non-2xx responses rather than throwing", async () => {
    mockRoute("/api/boom", () => errorResponse(503));

    const response = await fetch("https://example.test/api/boom");

    expect(response.ok).toBe(false);
    expect(response.status).toBe(503);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    mockJson("/api/thing", {});
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetch("https://example.test/api/thing", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects an in-flight request when the signal aborts", async () => {
    mockRoute(
      "/api/slow",
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(jsonResponse({})), 50)),
    );
    const controller = new AbortController();

    const pending = fetch("https://example.test/api/slow", { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("observerMock", () => {
  it("tracks observed elements and drops them on unobserve", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    const observer = new IntersectionObserver(() => {});

    observer.observe(first);
    observer.observe(second);
    expect(observedElements()).toHaveLength(2);

    observer.unobserve(first);
    expect(observedElements()).toEqual([second]);

    observer.disconnect();
    expect(observedElements()).toEqual([]);
  });

  it("fires the callback only for the intersected element", () => {
    const watched = document.createElement("div");
    const ignored = document.createElement("div");
    const seen: Array<{ target: Element; isIntersecting: boolean }> = [];
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        seen.push({ target: entry.target, isIntersecting: entry.isIntersecting });
      }
    });

    observer.observe(watched);

    intersect(ignored);
    expect(seen).toHaveLength(0);

    intersect(watched);
    expect(seen).toEqual([{ target: watched, isIntersecting: true }]);

    intersect(watched, false);
    expect(seen[1]).toEqual({ target: watched, isIntersecting: false });
  });
});
