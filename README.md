# wiki-scroll

An infinite feed of random English Wikipedia articles. Scroll, read, save.

**Stack:** Vite 6 + Vue 3.5 + TypeScript 5.7 (strict), Tailwind v4 (`@theme`, no
config file), Vitest + Testing Library. Runtime dependencies: `vue`. That is the
whole list, and it is deliberate.

## Running it

```bash
npm install
npm run dev           # dev server on :5173
npm test              # vitest
npm run test:watch    # the inner loop
npm run typecheck     # vue-tsc, includes test files
npm run lint          # eslint
npm run format        # prettier --write
npm run build         # typecheck + production build -> dist/
```

Node 22 (`.nvmrc`); CI reads the same file.

## Where things live

```
src/
  App.vue                  feed layout and the reader modal
  main.ts                  createApp
  components/              one directory per component: .vue + .spec.md + .test.ts
  composables/             useArticleFeed, useTheme
  lib/                     Wikimedia API access, pure helpers
  styles/tokens.css        the only place a colour is written down
  test/                    jsdom stubs and the fetch router
```

Each component ships an implementation, a `.spec.md` prop contract, and a unit
test. A component is not done without all three.

## Data

Everything comes from public Wikimedia APIs, called straight from the browser
with no key, no proxy and no server of our own:

| What             | Endpoint                                                      |
| ---------------- | ------------------------------------------------------------- |
| Random article   | `en.wikipedia.org/api/rest_v1/page/random/summary`            |
| Page views (30d) | `wikimedia.org/api/rest_v1/metrics/pageviews/per-article/...` |
| Creation date    | `w/api.php?action=query&prop=revisions&rvdir=newer`           |

That is three requests per article, so a batch of ten costs thirty — none of them
cached, deduplicated or cancellable. Replacing it with a single batched
`action=query&generator=random` call is in progress.

Article text is CC BY-SA 4.0. Rendering it outside Wikipedia's own chrome would
mean this app carries the attribution itself.

## Design system

`Button`, `Skeleton` and `Modal` are vendored from
[catalyst-ui](https://github.com/nafuza1299/catalyst-ui) and ported to Vue SFCs.
Vendoring here means copying directories, not installing a package — which is why
there is no barrel `index.ts` anywhere: a barrel would make a directory copy
silently incomplete. Imports are deep and relative
(`./components/Button/Button.vue`) on purpose.

Two rules carry over unchanged:

- **Semantic tokens only.** Never a raw Tailwind palette class (`bg-blue-600`) or
  a hex value in a component. Every colour resolves through
  `src/styles/tokens.css`.
- **Dark mode is `[data-theme]` on `<html>`, and nothing else.** No class
  toggling, no per-component theme prop. Three things honour that one contract
  and break together if it changes: the blocking `<script>` in `index.html`
  (writes it before first paint), `src/composables/useTheme.ts` (reads it, then
  owns it), and `tokens.css` (the `@custom-variant` every token resolves
  through). The attribute outranks `localStorage`: the script has already painted
  with it, so the first render has to agree with what is on screen.

### Deliberate divergences from catalyst-ui

- **Vitest, not Jest.** This project is already Vite, so Vitest reuses
  `vite.config.ts` and needs no transform wiring for SFCs; the Jest path needs
  `@vue/vue3-jest` plus ESM plumbing for the same result.
- **ESLint, not oxlint.** oxlint's `.vue` SFC support is not at parity with
  `eslint-plugin-vue`. Worth revisiting when it is.
- **Node 22, not 24** — that is what this toolchain is verified against.

## Notes

- **`Modal` owns its own widths.** Don't pass one through `class`: it lands in the
  same class attribute as the size, and Tailwind resolves conflicts by
  generated-CSS order rather than attribute order, so the winner is not something
  a caller can rely on. Add a size instead.
- **jsdom has no `IntersectionObserver` and no `matchMedia`.** `src/test/setup.ts`
  stubs both; anything mounting the feed throws without them. The observer stub is
  controllable (`intersect()`, `observedElements()`) so pagination can be driven
  deterministically rather than guessed at.
