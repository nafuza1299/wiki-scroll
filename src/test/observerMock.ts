import { vi } from "vitest";

/*
  jsdom ships no IntersectionObserver, so anything mounting the feed throws on
  mount without this.

  The mock is deliberately *controllable* rather than inert: `intersect()` drives
  pagination deterministically instead of leaving tests to guess when the browser
  would have fired, and `observedElements()` lets a test assert that `unobserve`
  actually ran — which is the leak the current feed hook has.
*/

interface ObserverRecord {
  callback: IntersectionObserverCallback;
  targets: Set<Element>;
  instance: IntersectionObserver;
}

const observers = new Set<ObserverRecord>();

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Document | Element | null;
  readonly rootMargin: string;
  readonly thresholds: ReadonlyArray<number>;
  private readonly record: ObserverRecord;

  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
    this.root = (options.root as Document | Element | null) ?? null;
    this.rootMargin = options.rootMargin ?? "0px";
    this.thresholds = Array.isArray(options.threshold)
      ? options.threshold
      : [options.threshold ?? 0];
    this.record = { callback, targets: new Set(), instance: this };
    observers.add(this.record);
  }

  observe(target: Element): void {
    this.record.targets.add(target);
  }

  unobserve(target: Element): void {
    this.record.targets.delete(target);
  }

  disconnect(): void {
    this.record.targets.clear();
    observers.delete(this.record);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function buildEntry(target: Element, isIntersecting: boolean): IntersectionObserverEntry {
  const rect = target.getBoundingClientRect();
  return {
    target,
    isIntersecting,
    intersectionRatio: isIntersecting ? 1 : 0,
    boundingClientRect: rect,
    intersectionRect: rect,
    rootBounds: null,
    time: 0,
  };
}

export function installIntersectionObserverMock(): void {
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
}

export function resetIntersectionObservers(): void {
  observers.clear();
}

/** Every element currently under observation, across all live observers. */
export function observedElements(): Element[] {
  const all = new Set<Element>();
  for (const record of observers) {
    for (const target of record.targets) all.add(target);
  }
  return [...all];
}

/** Fire an intersection for `target` on every observer watching it. */
export function intersect(target: Element, isIntersecting = true): void {
  for (const record of observers) {
    if (!record.targets.has(target)) continue;
    record.callback([buildEntry(target, isIntersecting)], record.instance);
  }
}
