import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Sandboxes that pre-provision Chromium outside Playwright's own cache (this
// one included) expose it at this fixed path. When it's there, use it instead
// of Playwright's version-pinned download; everywhere else (a normal CI
// runner), `npx playwright install chromium` provides the real thing and this
// is simply absent.
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath = existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined;

const PORT = 4173;

/*
  A real browser, not jsdom — the things the unit suite structurally cannot
  cover: infinite scroll actually firing (src/test/observerMock.ts drives
  IntersectionObserver by hand, since jsdom has none), the CSP being enforced,
  sanitised HTML staying inert once a real parser touches it, j/k moving real
  DOM focus, and the modal's Tab trap.

  Against `vite preview` of a production build, not the dev server. Two of the
  suites above need that specifically: the CSP meta tag and the hashed theme
  script only exist in built output, and the dev server injects its own HMR
  client, which changes what script-src has to allow. Running everything
  against the same build keeps one webServer instead of two.

  The Wikimedia API is mocked at the network layer, in two separate modules
  rather than one shared one:
  - e2e/mockWikipedia.ts — scroll.spec.ts, a11y.spec.ts,
    language-category-sort.spec.ts. Simple fixtures, multi-language.
  - e2e/routes.ts + e2e/fixtures.ts — csp.spec.ts, reader.spec.ts,
    keyboard.spec.ts, modal-focus.spec.ts, deep-links.spec.ts,
    feed-error.spec.ts. Carries live XSS payloads and an offline toggle that
    the security and error-state specs need and the first module has no
    reason to.
  Both are deterministic and offline rather than hitting the live API — same
  reasoning as src/test/fetchMock.ts one level up, applied at the browser's
  network layer instead of jsdom's global fetch.
*/
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // On the retry, not the first run: a trace for every passing test is a lot
    // of artefact for no information.
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    // A cold `vite build` dominates this; the server itself starts instantly.
    timeout: 180_000,
  },
});
