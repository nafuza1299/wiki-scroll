import type { Page, Route } from "@playwright/test";
import { HOSTILE_ARTICLE_HTML, PIXEL_PNG, related, searchResults, summary } from "./fixtures";

/*
  Browser-level interception of every Wikimedia request.

  This is not only about flakiness. The security specs need article HTML
  carrying live XSS payloads, and Wikipedia will not serve that — so the only
  way to exercise the sanitiser and the CSP against real attacks is to author
  the response ourselves. Determinism is the second benefit, not the first.

  It reads like src/test/fetchMock.ts on purpose, but it cannot reuse it: that
  one replaces globalThis.fetch inside jsdom, and this one intercepts at the
  browser's network layer, where the code under test is untouched production
  output.

  The CORS header is load-bearing. A fulfilled response is still subject to the
  same-origin policy, so without `access-control-allow-origin` every one of these
  cross-origin reads fails in a way that looks exactly like a broken app.
*/

const CORS = { "access-control-allow-origin": "*" };

export interface RouteState {
  /** Flip to true and every Wikimedia request fails, as if the network died. */
  offline: boolean;
  /** Every URL the page asked for, in order. */
  requested: string[];
}

export interface RouteOptions {
  /** Titles the random feed hands out, in order. Cycles once exhausted. */
  titles?: readonly string[];
  /** What the reader receives. Defaults to the hostile fixture. */
  articleHtml?: string;
  /** Start with the network already failing. */
  offline?: boolean;
}

const DEFAULT_TITLES = [
  "Fixture Alpha",
  "Fixture Beta",
  "Fixture Gamma",
  "Fixture Delta",
  "Fixture Epsilon",
  "Fixture Zeta",
  "Fixture Eta",
  "Fixture Theta",
  "Fixture Iota",
  "Fixture Kappa",
];

function json(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: CORS,
    body: JSON.stringify(body),
  });
}

function titleFromPath(url: string): string {
  const path = new URL(url).pathname;
  return decodeURIComponent(path.slice(path.lastIndexOf("/") + 1)).replace(/_/g, " ");
}

export async function installRoutes(page: Page, options: RouteOptions = {}): Promise<RouteState> {
  const titles = options.titles ?? DEFAULT_TITLES;
  const articleHtml = options.articleHtml ?? HOSTILE_ARTICLE_HTML;
  const state: RouteState = { offline: options.offline ?? false, requested: [] };

  let randomIndex = 0;

  /*
    Every handler funnels through here so `offline` is honoured uniformly and
    the request log stays complete. `abort("failed")` is what a dropped
    connection looks like to fetch(), which is the condition the feed's error
    state exists for.
  */
  const handle = (respond: (route: Route, url: string) => Promise<void>) => {
    return async (route: Route): Promise<void> => {
      const url = route.request().url();
      state.requested.push(url);
      if (state.offline) {
        await route.abort("failed");
        return;
      }
      await respond(route, url);
    };
  };

  /*
    Probe targets for csp.e2e.ts, served from a host the app otherwise talks to.

    An unreachable host would make that spec meaningless: a blocked request and a
    failed DNS lookup produce the same nothing. Served from here, both of these
    would succeed if the policy were absent — so when they fail, the policy is
    the reason.
  */
  await page.route(
    "**/e2e-probe.js",
    handle(async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        headers: CORS,
        body: "window.__cspExternal = true;",
      });
    }),
  );

  await page.route(
    "**/e2e-probe-frame.html",
    handle(async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        headers: CORS,
        body: "<!DOCTYPE html><title>probe</title><p>probe frame</p>",
      });
    }),
  );

  // Each call must yield a different article: the app requests this one URL ten
  // times with cache "bypass" precisely because it expects ten different pages.
  await page.route(
    "**/api/rest_v1/page/random/summary",
    handle(async (route) => {
      const title = titles[randomIndex % titles.length];
      const id = 1000 + randomIndex;
      randomIndex += 1;
      await json(route, summary({ id, title }));
    }),
  );

  await page.route(
    "**/api/rest_v1/page/summary/*",
    handle(async (route, url) => {
      const title = titleFromPath(url);
      await json(route, summary({ id: 2000 + title.length, title }));
    }),
  );

  await page.route(
    "**/api/rest_v1/page/mobile-html/*",
    handle(async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        headers: CORS,
        body: articleHtml,
      });
    }),
  );

  await page.route(
    "**/api/rest_v1/page/related/*",
    handle(async (route) => {
      await json(route, related(["Related One", "Related Two", "Related Three"]));
    }),
  );

  // Pageviews and creation dates are enrichment: they patch a card that is
  // already on screen, so they only need to be well-formed, never interesting.
  await page.route(
    "**/api/rest_v1/metrics/**",
    handle(async (route) => {
      await json(route, { items: [{ views: 1200 }, { views: 800 }] });
    }),
  );

  await page.route(
    "**/w/api.php*",
    handle(async (route, url) => {
      const params = new URL(url).searchParams;

      if (params.get("action") === "opensearch") {
        const query = params.get("search") ?? "";
        await json(route, [query, [`${query} suggestion`, `${query} alternative`], [], []]);
        return;
      }

      if (params.get("list") === "search") {
        await json(route, searchResults(["Search Hit One", "Search Hit Two", "Search Hit Three"]));
        return;
      }

      if (params.get("prop") === "revisions") {
        await json(route, {
          query: { pages: { "1": { revisions: [{ timestamp: "2004-03-02T00:00:00Z" }] } } },
        });
        return;
      }

      await json(route, {});
    }),
  );

  await page.route(
    "https://upload.wikimedia.org/**",
    handle(async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: CORS,
        body: PIXEL_PNG,
      });
    }),
  );

  return state;
}

/**
 * Values written by the fixture's XSS payloads. Read after the reader renders:
 * undefined means nothing ran, and any string names the defence that gave way.
 */
export async function pwnedMarker(page: Page): Promise<string | undefined> {
  return page.evaluate(() => (window as { __pwned?: string }).__pwned);
}
