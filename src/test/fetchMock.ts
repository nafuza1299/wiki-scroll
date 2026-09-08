import { vi } from "vitest";

/*
  A ~100-line URL router in place of MSW. MSW is a large dependency and a service
  worker's worth of machinery for a repo whose whole runtime dependency list is
  one entry; this covers what the tests actually need.

  It honours AbortSignal on purpose — the HTTP layer's cancellation and
  refcounted-dedupe behaviour cannot be tested against a mock that ignores it.
*/

export interface MockRequest {
  url: string;
  init?: RequestInit;
}

export type FetchHandler = (request: MockRequest) => Response | Promise<Response>;

interface Route {
  match: string | RegExp;
  handler: FetchHandler;
}

const routes: Route[] = [];
const calls: string[] = [];

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(abortError()), { once: true });
  });
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = resolveUrl(input);
  calls.push(url);

  const signal = init?.signal ?? undefined;
  if (signal?.aborted) throw abortError();

  const route = routes.find((candidate) =>
    typeof candidate.match === "string"
      ? url.includes(candidate.match)
      : candidate.match.test(url),
  );

  if (!route) {
    throw new Error(
      `fetchMock: no route matched ${url}\nRegistered: ${
        routes.map((r) => String(r.match)).join(", ") || "(none)"
      }`,
    );
  }

  const result = Promise.resolve(route.handler({ url, init }));
  return signal ? Promise.race([result, rejectOnAbort(signal)]) : result;
}

export function installFetchMock(): void {
  vi.stubGlobal("fetch", mockFetch);
}

export function resetFetchMock(): void {
  routes.length = 0;
  calls.length = 0;
}

/** Later registrations win, so a test can override a shared default. */
export function mockRoute(match: string | RegExp, handler: FetchHandler): void {
  routes.unshift({ match, handler });
}

export function mockJson(match: string | RegExp, body: unknown, init?: ResponseInit): void {
  mockRoute(match, () => jsonResponse(body, init));
}

export function fetchCalls(): readonly string[] {
  return calls;
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

export function textResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html" },
    ...init,
  });
}

export function errorResponse(status: number, init: ResponseInit = {}): Response {
  return new Response("", { status, ...init });
}
