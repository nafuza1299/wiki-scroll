import { configDefaults } from "vitest/config";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command }) => ({
  // GitHub Pages serves this as a project site, under /wiki-scroll/, not the
  // domain root — but every OTHER production build (Vercel, `npm run build`
  // locally, CI's own build check) is served from "/". Gating on
  // command === "build" alone broke exactly that: Vercel's build got the
  // /wiki-scroll/ prefix too, so its index.html asked for assets that don't
  // exist at its domain root and the app never mounted — a white page. Only
  // .github/workflows/deploy.yml sets GITHUB_PAGES, so this only fires there.
  base: command === "build" && process.env.GITHUB_PAGES === "true" ? "/wiki-scroll/" : "/",
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
