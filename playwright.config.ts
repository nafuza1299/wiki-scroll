import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Sandboxes that pre-provision Chromium outside Playwright's own cache (this
// one included) expose it at this fixed path. When it's there, use it instead
// of Playwright's version-pinned download; everywhere else (a normal CI
// runner), `npx playwright install chromium` provides the real thing and this
// is simply absent.
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath = existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined;

/*
  A real browser, not jsdom — the one thing the unit suite structurally cannot
  cover. `src/test/observerMock.ts` drives IntersectionObserver by hand because
  jsdom has none; that means infinite scroll itself, the actual "element enters
  the viewport, the feed fetches page two" mechanism, has never run anywhere
  before this.

  The Wikimedia API is mocked at the network layer (see e2e/mockWikipedia.ts)
  rather than hit live: deterministic, offline-capable, and immune to
  Wikipedia's own rate limits and content changes.
*/
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "dot" : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
});
