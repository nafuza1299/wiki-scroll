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
  { ignores: ["dist/**", "coverage/**", "node_modules/**"] },

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
    },
  },

  {
    files: ["**/*.test.ts", "src/test/**/*.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },

  // Must stay last: turns off everything Prettier owns.
  prettier,
);
