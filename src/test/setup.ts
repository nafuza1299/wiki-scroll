import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/vue";
import { installFetchMock, resetFetchMock } from "./fetchMock";
import { installIntersectionObserverMock, resetIntersectionObservers } from "./observerMock";

// jsdom has no matchMedia, and useTheme reads it during initialisation.
function installMatchMediaMock(): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

beforeEach(() => {
  installMatchMediaMock();
  installIntersectionObserverMock();
  installFetchMock();
});

afterEach(() => {
  cleanup();
  resetFetchMock();
  resetIntersectionObservers();
  vi.unstubAllGlobals();
  localStorage.clear();

  // Every test in a file shares one jsdom document, and useTheme reads
  // [data-theme] ahead of localStorage — without this, one test's final theme
  // silently becomes the next test's initial theme, and the failure surfaces in
  // the wrong test.
  document.documentElement.removeAttribute("data-theme");

  // Modal's scroll lock is module-level state; a leaked lock breaks later tests.
  document.body.style.overflow = "";
});
