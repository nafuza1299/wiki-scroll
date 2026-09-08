# Button

The single interactive control for actions. Anything clickable that is not a
navigation link should be this.

## Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `"primary" \| "secondary" \| "ghost" \| "destructive"` | `"primary"` | One primary per view; `destructive` only for irreversible actions. |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | Affects height, padding, and font-size. |
| `loading` | `boolean` | `false` | Shows a spinner and disables interaction. The button keeps its width. |
| `iconOnly` | `boolean` | `false` | Enforces a square shape. **Requires `aria-label`** — there is no text to read. |
| `disabled` | `boolean` | `false` | |

Attributes not listed here (`aria-label`, `title`, `form`, …) fall through to the
`<button>` element.

## Events

| Event | Payload | Notes |
|---|---|---|
| `click` | `MouseEvent` | Native; suppressed while `loading` or `disabled`. |

## Behavior and accessibility

- `type="button"` by default, so a button inside a form does not submit it by accident.
- `loading` sets `aria-busy` and the `disabled` attribute — a loading button cannot be double-fired.
- Focus is always visible: `focus-visible:ring-2` with an offset against the page background.
- `min-h-11` (44px) holds the mobile touch-target floor even at `sm`, where the
  padding and font are visually smaller. That floor relaxes to the visual size at
  the `sm:` breakpoint and up, where pointers are precise.

## Do / Don't

- Do give every `iconOnly` button an `aria-label`.
- Do use `loading` rather than swapping the label to "Saving…" — the width stays put.
- Don't hand-roll a button from a `<div>` with a click handler; that is the defect
  this component exists to prevent.
- Don't strip the `focus-visible:` classes to make a design look cleaner.

## Usage

```vue
<Button variant="destructive" :loading="isDeleting" @click="remove">Delete</Button>

<Button variant="ghost" size="sm" icon-only aria-label="Close" @click="close">
  <CloseIcon />
</Button>
```
