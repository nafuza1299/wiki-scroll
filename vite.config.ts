/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  test: {
    /*
      Pinned rather than left to the default, which matches any .test.ts or
      .spec.ts anywhere in the project and would collect the Playwright specs in
      e2e/ — where `test` means something else entirely and there is no browser
      to drive.

      Narrowing `include` rather than extending `exclude`: overriding `exclude`
      replaces its defaults, silently dropping node_modules and dist along with it.
    */
    include: ["src/**/*.test.ts"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Component tests assert on classes and ARIA, never on computed styles, so
    // processing Tailwind for every test file would be pure cost.
    css: false,
  },
});
