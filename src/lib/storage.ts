import { readonly, ref, type Ref } from "vue";

/*
  A versioned, quota-safe wrapper over localStorage.

  Three rules, each of which is a real failure this avoids:

  - Availability is probed lazily, in a try/catch, never at module scope. Safari
    private mode throws on setItem, a user can disable storage entirely, and a
    module-scope access would take the whole app down at import time — before
    anything is on screen to explain why.
  - A read never throws. Corrupt JSON, a value written by an older version, a
    shape that no longer parses: all of them fall back rather than propagate.
  - A write never throws. On quota exhaustion the value stays in memory and the
    session continues; losing a bookmark is not worth losing the app over.
*/

interface Envelope {
  v: number;
  data: unknown;
}

export interface PersistedStore<T> {
  /** Read-only view. Mutate through set/update so persistence stays in step. */
  readonly state: Readonly<Ref<T>>;
  set(next: T): void;
  update(mutate: (previous: T) => T): void;
  reset(): void;
  /** True once a write has failed — storage is unavailable or full. */
  readonly degraded: boolean;
}

interface Backend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  persistent: boolean;
}

const PROBE_KEY = "__wiki_scroll_probe__";

function memoryBackend(): Backend {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    persistent: false,
  };
}

let cachedBackend: Backend | null = null;

function backend(): Backend {
  if (cachedBackend) return cachedBackend;
  try {
    if (typeof localStorage === "undefined") throw new Error("no localStorage");
    // A read alone is not enough — private mode allows reads and throws on write.
    localStorage.setItem(PROBE_KEY, "1");
    localStorage.removeItem(PROBE_KEY);
    cachedBackend = {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: (key) => localStorage.removeItem(key),
      persistent: true,
    };
  } catch {
    cachedBackend = memoryBackend();
  }
  return cachedBackend;
}

/** Tests only: the probe result is cached for the life of the module. */
export function resetStorageBackend(): void {
  cachedBackend = null;
}

export function createPersistedStore<T>(options: {
  key: string;
  version: number;
  /** Called for a fresh value, so each store gets its own object. */
  fallback: () => T;
  /** Validates and migrates. Return null to discard what is stored. */
  parse: (data: unknown, version: number) => T | null;
}): PersistedStore<T> {
  const { key, version, fallback, parse } = options;

  function load(): T {
    try {
      const raw = backend().getItem(key);
      if (raw === null) return fallback();

      const envelope = JSON.parse(raw) as Envelope | null;
      if (!envelope || typeof envelope !== "object" || typeof envelope.v !== "number") {
        return fallback();
      }
      return parse(envelope.data, envelope.v) ?? fallback();
    } catch {
      // Corrupt JSON, a hostile value, an unreadable store — start clean.
      return fallback();
    }
  }

  const state = ref(load()) as Ref<T>;
  let degraded = false;

  function persist(): void {
    try {
      backend().setItem(key, JSON.stringify({ v: version, data: state.value } satisfies Envelope));
      degraded = false;
    } catch {
      // Quota exhausted or storage revoked. The in-memory value stands.
      degraded = true;
    }
  }

  function set(next: T): void {
    state.value = next;
    persist();
  }

  // Keeps other tabs in step. The storage event does not fire in the tab that
  // wrote, which is why writes update `state` directly rather than relying on it.
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key !== key && event.key !== null) return;
      state.value = load();
    });
  }

  return {
    state: readonly(state) as Readonly<Ref<T>>,
    set,
    update: (mutate) => set(mutate(state.value)),
    reset: () => {
      try {
        backend().removeItem(key);
      } catch {
        // Nothing to do; the in-memory reset below still applies.
      }
      state.value = fallback();
    },
    get degraded() {
      return degraded;
    },
  };
}

/** Keeps the newest `max` entries of a FIFO list. */
export function capFifo<T>(items: readonly T[], max: number): T[] {
  return items.length <= max ? [...items] : items.slice(items.length - max);
}
