import { defineConfig, devices } from "@playwright/test";

/*
  These specs run against `vite preview` of the production build, never the dev
  server. The two things they exist to prove — that the CSP is enforced and that
  the hashed theme script is exempt from it — only exist in built output, and the
  dev server injects its own HMR client, which would change what `script-src`
  has to allow.

  Chromium only. The suite tests CSP enforcement, focus order and sanitiser
  behaviour, none of which differ usefully across engines, and a second browser
  would double CI time for no signal this repo is short of.
*/
const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts$/,
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

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    // A cold `vite build` dominates this; the server itself starts instantly.
    timeout: 180_000,
  },
});
