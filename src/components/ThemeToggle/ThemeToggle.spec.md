# ThemeToggle

An icon-only light/dark switch over `useTheme`.

## Props

None. It reads and writes the app-wide theme singleton.

## Behavior and accessibility

- `aria-label` states the destination, not the current state ("Switch to light
  mode" while dark), because that is what the control will do.
- The icon is `aria-hidden`; the label carries the whole meaning.
- Toggling writes `[data-theme]` on `<html>` and persists to
  `localStorage["wiki-scroll:theme"]`.

## The theming contract

`[data-theme]` on `<html>` is the entire mechanism — no class swapping, no
CSS-in-JS, no per-component theme prop. Three things honour it, and they break
together if it changes: the blocking `<script>` in `index.html` (writes it before
first paint), `src/composables/useTheme.ts` (reads it, then owns it), and
`src/styles/tokens.css` (the `@custom-variant` that every token resolves through).

**The attribute outranks `localStorage`.** `resolveInitialTheme` reads
`[data-theme]` first and only falls through to storage when it is absent. The
blocking script has already painted with the attribute, so the app's first render
has to agree with what is on screen — otherwise the page flashes, and under SSR
the render disagrees with the markup. Storage is where the choice is _persisted_;
the attribute is what is currently _true_. Do not reorder them.

## Usage

```vue
<ThemeToggle />
```
