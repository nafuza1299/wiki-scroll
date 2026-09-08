/*
  The fetch layer: retry with backoff, in-flight deduplication, bounded caching,
  and cancellation.

  This replaces `fetchArticle(retriesLeft = 5)`, which retried a three-request
  pipeline with no backoff and no wall-clock bound, and swallowed the reason.
  Retry belongs at the transport, where it can tell a 404 from a 503 and honour
  Retry-After.
*/

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly retryAfterMs?: number,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  /**
   * "prefer" reads and writes the cache and shares in-flight requests.
   * "bypass" does neither — required for `generator=random`-style endpoints,
   * where two identical URLs must produce two different results and sharing
   * would silently collapse them into one.
   */
  cache?: "prefer" | "bypass";
  ttlMs?: number;
  retries?: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_RETRIES = 2;
const RETRY_BASE_MS = 150;

/** JSON payloads are small; article HTML is 100 KB–1 MB, so it gets its own cap. */
const JSON_CACHE_MAX = 100;
const HTML_CACHE_MAX = 8;

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/*
  Duck-typed on purpose. `error instanceof Error` looks like the obvious check
  and is not reliable: DOMException does not extend Error under jsdom, and has
  not always done so in browsers either. Where that check fails, a cancelled
  request is misreported to the user as a failure — so every abort check in the
  app goes through this one function.
*/
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function isRetriableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

/** Exponential with jitter, so a batch of failures does not retry in lockstep. */
function backoffMs(attempt: number): number {
  return RETRY_BASE_MS * 2 ** attempt * (0.5 + Math.random());
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

class LruCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly max: number) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Re-insert to mark as most recently used.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

const jsonCache = new LruCache<unknown>(JSON_CACHE_MAX);
const textCache = new LruCache<string>(HTML_CACHE_MAX);

interface InFlight {
  promise: Promise<unknown>;
  controller: AbortController;
  refs: number;
}

const inFlight = new Map<string, InFlight>();

/*
  Attaching a caller to a shared request.

  The subtlety worth the code: one caller unmounting must not cancel the request
  another caller is still waiting on. Each caller holds a reference; the shared
  AbortController only fires when the last live caller drops. A caller whose own
  signal aborts just gets a rejected promise, and the request continues for
  everyone else.
*/
function join<T>(entry: InFlight, signal: AbortSignal | undefined): Promise<T> {
  entry.refs += 1;
  let detached = false;
  const detach = (): void => {
    if (detached) return;
    detached = true;
    entry.refs -= 1;
  };

  const shared = entry.promise as Promise<T>;

  if (!signal) {
    return shared.then(
      (value) => {
        detach();
        return value;
      },
      (error) => {
        detach();
        throw error;
      },
    );
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      detach();
      if (entry.refs <= 0) entry.controller.abort();
      reject(abortError());
    };

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });

    shared.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        detach();
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        detach();
        reject(error);
      },
    );
  });
}

async function runWithRetry<T>(
  url: string,
  parse: (response: Response) => Promise<T>,
  retries: number,
  signal: AbortSignal | undefined,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    let waitMs: number;

    try {
      const response = await fetch(url, { signal });
      if (response.ok) return await parse(response);

      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      if (!isRetriableStatus(response.status) || attempt >= retries) {
        throw new HttpError(response.status, url, retryAfterMs);
      }
      waitMs = retryAfterMs ?? backoffMs(attempt);
    } catch (error) {
      // A cancelled request is not a failure to retry, and a non-retriable
      // status has already been decided above.
      if (isAbortError(error) || error instanceof HttpError) throw error;
      if (attempt >= retries) throw error;
      waitMs = backoffMs(attempt);
    }

    await delay(waitMs, signal);
  }
}

function request<T>(
  url: string,
  cache: LruCache<T>,
  parse: (response: Response) => Promise<T>,
  options: RequestOptions,
): Promise<T> {
  const {
    signal,
    cache: mode = "prefer",
    ttlMs = DEFAULT_TTL_MS,
    retries = DEFAULT_RETRIES,
  } = options;

  if (mode === "bypass") {
    return runWithRetry(url, parse, retries, signal);
  }

  const cached = cache.get(url);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = inFlight.get(url);
  if (existing) return join<T>(existing, signal);

  const controller = new AbortController();
  const entry: InFlight = { controller, refs: 0, promise: Promise.resolve() };

  entry.promise = runWithRetry(url, parse, retries, controller.signal)
    .then((value) => {
      cache.set(url, value, ttlMs);
      return value;
    })
    .finally(() => {
      if (inFlight.get(url) === entry) inFlight.delete(url);
    });

  /*
    The shared promise must always carry a rejection handler of its own. A caller
    whose signal has already aborted rejects immediately without ever attaching
    one, and if it was the only caller the shared rejection would surface as an
    unhandled promise rejection. join() adds the real handlers on top.
  */
  entry.promise.catch(() => {});

  inFlight.set(url, entry);
  return join<T>(entry, signal);
}

export function fetchJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  return request<T>(
    url,
    jsonCache as LruCache<T>,
    (response) => response.json() as Promise<T>,
    options,
  );
}

export function fetchText(url: string, options: RequestOptions = {}): Promise<string> {
  return request<string>(url, textCache, (response) => response.text(), options);
}

/** Tests only — module-level caches otherwise leak between test files. */
export function clearHttpCaches(): void {
  jsonCache.clear();
  textCache.clear();
  inFlight.clear();
}
