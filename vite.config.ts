import { configDefaults } from "vitest/config";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command }) => ({
  // GitHub Pages serves this as a project site, under /wiki-scroll/, not the
  // domain root — but only for the production build. Dev and test both run
  // under Vite's own "serve" command and stay at "/" so `npm run dev` and
  // Vitest are unaffected.
  base: command === "build" ? "/wiki-scroll/" : "/",
  plugins: [vue(), tailwindcss()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Component tests assert on classes and ARIA, never on computed styles, so
    // processing Tailwind for every test file would be pure cost.
    css: false,
    // e2e/*.spec.ts matches Vitest's own default include glob (*.spec.ts), but
    // those are Playwright tests — real-browser-only and run through
    // `npm run test:e2e`, not here.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
}));
