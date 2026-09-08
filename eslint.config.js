import js from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";
import vueA11y from "eslint-plugin-vuejs-accessibility";
import prettier from "eslint-config-prettier";
import globals from "globals";

/*
  ESLint rather than catalyst-ui's oxlint: oxlint's .vue SFC support is not at
  parity with eslint-plugin-vue, which is what the Vue ecosystem actually uses.
  A deliberate divergence between the two repos, noted in the README.

  vuejs-accessibility is here for a specific reason — the a11y defect this app
  shipped (a clickable <section> with no role, no tabindex and no key handler) is
  exactly what these rules catch.
*/
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      // Playwright's own output: traces, screenshots and the HTML report.
      "test-results/**",
      "playwright-report/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  ...vueA11y.configs["flat/recommended"],

  {
    files: ["**/*.{ts,vue}"],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        // The Vue parser handles <template>; TS parsing inside <script setup>
        // is delegated to typescript-eslint.
        parser: tseslint.parser,
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Component filenames are single-word by design (Button.vue, Modal.vue),
      // matching the vendored catalyst-ui layout.
      "vue/multi-word-component-names": "off",
      // The rule defaults to demanding nesting *and* a for/id pair. Either one
      // is a valid association; requiring both rules out wrapping a control in
      // its own label, which is the more robust of the two.
      "vuejs-accessibility/label-has-for": ["error", { required: { some: ["nesting", "id"] } }],
    },
  },

  {
    files: ["**/*.test.ts", "src/test/**/*.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },

  {
    // The e2e specs straddle two runtimes: the file runs in Node, and the
    // callbacks inside page.evaluate run in the browser. Both sets of globals
    // are legitimately in scope, so both are declared.
    files: ["e2e/**/*.ts", "playwright.config.ts"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // Must stay last: turns off everything Prettier owns.
  prettier,
);
