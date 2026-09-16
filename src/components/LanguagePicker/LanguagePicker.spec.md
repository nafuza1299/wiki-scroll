# LanguagePicker

A native `<select>` over the app's twelve supported Wikipedia languages.

## Props

| Prop         | Type     | Required | Description                                     |
| ------------ | -------- | -------- | ----------------------------------------------- |
| `modelValue` | `string` | Yes      | The current language code, e.g. `"en"`, `"fr"`. |

## Emits

| Event               | Payload  | When                           |
| ------------------- | -------- | ------------------------------ |
| `update:modelValue` | `string` | The user picks a new language. |

Controlled, like every other `v-model`-shaped component in this repo — the
caller owns `modelValue` and decides what happens on the emit. Here that means
`App.vue` calling `navigate({ ...route.value, lang: next })`, so the language
lives in the URL like every other feed-affecting parameter.

## Why a native `<select>`, not a custom dropdown

A styled popover needs floating-ui or an equivalent positioning library to
place itself correctly near the trigger, plus its own keyboard handling for
arrow-key navigation and typeahead. A `<select>` gets all of that from the
browser for free — including the native mobile picker — at the cost of less
control over its open-state appearance, which nothing here asks for. This
repo's runtime dependency list has exactly one entry (`vue`); a dropdown
implementation would be the second.

## Language list

The 12 languages come from `src/lib/wikipedia/languages.ts` as `{code, label}`
pairs, not the full ~300 Wikipedia editions — a curated list keeps this
component free of a fetch-and-cache step for the far larger sitematrix. See
that file for the exact list and `isSupportedLang`, which `routes.ts` uses to
validate `?lang=` before it ever reaches this component.

## Usage

```vue
<LanguagePicker :model-value="route.lang" @update:model-value="setLang" />
```
