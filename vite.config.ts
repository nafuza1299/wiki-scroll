/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Both frameworks are present for the duration of the port: react() still
  // compiles the existing .tsx app while vue() picks up the .vue components as
  // they land, so every commit in between builds and runs. react() and its
  // dependencies come out once App.vue replaces App.tsx.
  plugins: [react(), vue(), tailwindcss()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Component tests assert on classes and ARIA, never on computed styles, so
    // processing Tailwind for every test file would be pure cost.
    css: false,
  },
});
