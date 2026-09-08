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
| Search           | `w/api.php?action=query&list=search`, then a summary per hit  |
| More like this   | `en.wikipedia.org/api/rest_v1/page/related/{title}`           |
| Suggestions      | `w/api.php?action=opensearch`                                 |
| Page views (30d) | `wikimedia.org/api/rest_v1/metrics/pageviews/per-article/...` |
| Creation date    | `w/api.php?action=query&prop=revisions&rvdir=newer`           |

Only the first blocks. View counts and creation dates are fetched afterwards, at
most four at a time, and patched onto cards that are already on screen — so a
page of ten costs ten blocking requests rather than thirty. Requests are
deduplicated by URL, cached with a TTL, retried with backoff on 429/5xx only, and
cancelled when the feed moves on.

Search goes through `list=search` plus a summary per hit rather than a single
`generator=search` carrying extracts inline, for the same reason random does: one
response shape the app already normalises, and summaries are cacheable by title.
"More like this" uses the REST related endpoint over CirrusSearch's `morelike:`,
which Wikimedia throttles for non-cacheable queries and offers no stability
guarantee for.

**Possible follow-up:** random, search and their metadata all collapse into
_single_ `action=query&generator=…` calls carrying extracts, thumbnails, URLs,
revisions and `prop=pageviews&pvipdays=30` for every page at once — ten cards for
one request rather than ten. Not implemented because `exlimit` interacts with
`exintro` in a way that needs checking against the live API, and guessing wrong
breaks the feed rather than degrading it. Confirm with one request, then the
change is confined to the loaders in `feedSource.ts` and a new URL builder.

## The reader

Opening a card fetches `mobile-html`, sanitises it, and renders it inline with
the app's own tokens — no iframe. An iframe would break the modal's focus trap:
once focus enters a frame the parent's Tab handler stops seeing it, and the user
tabs through hundreds of article links and straight out of the dialog.

That means third-party HTML goes into this origin's DOM, which is the largest
attack surface in the app. Three things carry the safety, and none of them is
optional:

1. **`src/lib/sanitizeArticleHtml.ts` is allowlist-based**, parses through
   `DOMParser` (an inert document — nothing executes or loads), drops every
   `on*` handler and every inline `style`, and resolves every URL to check for an
   http(s) protocol, which rules out `javascript:` and `data:` in one place.
2. **31 tests** cover it, including the payloads a sanitiser is supposed to stop.
3. **A CSP in `index.html`**, so a bug in (1) still cannot load or execute
   anything. `script-src` deliberately has no `'unsafe-inline'` — that is exactly
   what would let a missed inline handler run. The pre-paint theme script is
   allowed by SHA-256 hash instead, and `src/test/csp.test.ts` recomputes that
   hash from the file so reformatting cannot silently break it.

Article text is CC BY-SA 4.0. Rendering it outside Wikipedia's own chrome moves
the attribution obligation onto this app, which the reader footer discharges.

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
