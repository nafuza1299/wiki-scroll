# CategoryFilter

A category name field plus an optional From/To creation-year range, submitted
together as a single seed for the feed's `category` mode.

## Props

| Prop       | Type             | Required | Description                                                                                                         |
| ---------- | ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `category` | `string`         | Yes      | The category currently driving the feed, bare name, no `"Category:"` prefix. Empty when category mode isn't active. |
| `yearFrom` | `number \| null` | Yes      | Inclusive lower bound on creation year. `null` means unset.                                                         |
| `yearTo`   | `number \| null` | Yes      | Inclusive upper bound on creation year. `null` means unset.                                                         |
| `lang`     | `string`         | Yes      | Which wiki language the field is for. Only `"en"` offers curated category suggestions.                              |

## Emits

| Event    | Payload                                                                  | When                                                                                 |
| -------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `submit` | `{ category: string; yearFrom: number \| null; yearTo: number \| null }` | The form is submitted (Enter in any field, or the button) with a non-blank category. |
| `clear`  | —                                                                        | The "Clear category" button is pressed.                                              |

Controlled, like `SearchBar` and `LanguagePicker` — the caller owns the props
and decides what `submit`/`clear` do. In `App.vue` that's
`navigate({ ...route.value, query: "", category, yearFrom, yearTo, related: null, article: null })`.

## Behavior

- The year fields are `disabled` while the category draft is blank — a year
  range has nothing to apply to without a category, and disabling says so
  more directly than a validation message would.
- Submitting with a blank category is a no-op: no `submit` event fires. The
  fields stay as typed rather than clearing, so nothing is lost.
- A typed year is validated by `parseYear` from `src/lib/routes.ts` — the same
  function `?yf=`/`?yt=` parsing uses — rather than a second copy of the same
  four-digit check. An unparseable year (`"abc"`, `"1975.5"`, a negative
  number) is submitted as `null`, not rejected outright; same tolerance the
  URL already has.
- The three fields stay in step with the props from outside (a shared link, Back,
  or typing `"Category:Physics"` into the search box instead), the same
  `watch`-and-compare pattern `SearchBar` uses for its own draft.
- The category field is a native combobox (`<input list>` + `<datalist>`, the
  same mechanism `SearchBar` uses for its own suggestions): when `lang` is
  `"en"`, the browser offers a small curated list of popular category names
  from `src/lib/wikipedia/categories.ts`. Typing any other category name —
  not just ones in the list — still works exactly as it always has; the
  dropdown is a shortcut, never a restriction. For any other language, no
  options are offered and the field is plain free text, since the curated
  names are only written in English.

## Usage

```vue
<CategoryFilter
  :category="route.category ?? ''"
  :year-from="route.yearFrom"
  :year-to="route.yearTo"
  :lang="lang"
  @submit="setCategory"
  @clear="backToRandom"
/>
```
