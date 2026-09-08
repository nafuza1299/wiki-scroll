# Modal

A controlled, teleported dialog for confirmations, forms, and focused tasks.

## Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `open` | `boolean` | required | The caller owns visibility. |
| `size` | `"sm" \| "md" \| "lg" \| "reader"` | `"md"` | `sm` max-w-sm, `md` max-w-lg, `lg` max-w-2xl, `reader` max-w-3xl at a fixed 85vh. |
| `closeOnOverlayClick` | `boolean` | `true` | Set false for explicit-action flows. |
| `closeOnEscape` | `boolean` | `true` | Set false only when Escape must not abandon the flow. |
| `loading` | `boolean` | `false` | Replaces content with `Modal.Skeleton`. |

## Events

| Event | Payload | Notes |
|---|---|---|
| `update:open` | `boolean` | Emits `false` for every dismissal route, so `v-model:open` works. |

### `Modal.Body`

| Prop | Type | Default | Notes |
|---|---|---|---|
| `scrollable` | `boolean` | `false` | Makes the body focusable and claims initial focus. Set it when the body holds long scrollable content. |

## Behavior and accessibility

- Teleports to `document.body`, locks body scroll, traps Tab/Shift+Tab, and
  restores focus to the trigger on close.
- Escape, the backdrop, and the Header close button all emit `update:open(false)`.
- The panel is `role="dialog"` + `aria-modal="true"`; `Modal.Title` supplies
  `aria-labelledby`. Under `loading` it falls back to `aria-label` + `aria-busy`,
  because the title does not exist yet.
- The Body scrolls within the panel, keeping Header and Footer visible.
- Nested modals share one scroll-lock counter, so closing an inner dialog does
  not restore scrolling while an outer one is still open.
- The focusable list is cached and invalidated by a `MutationObserver` rather
  than re-queried on every Tab — `reader` panels hold hundreds of links.
- `Modal.Body scrollable` exists because a scroll region containing no focusable
  element cannot be scrolled by keyboard at all.

## Do / Don't

- Do keep it controlled, and include `Modal.Title` for the accessible name.
- Do use `sm` for confirmations, `lg` for lengthy content, `reader` for article text.
- **Don't pass a width through `class`.** It lands in the same class attribute as
  the size, and Tailwind resolves conflicts by generated-CSS order, not attribute
  order — the winner is not something you can rely on. Add a size instead.
- Don't use a modal for routine navigation or for content that belongs inline.

## Usage

```vue
<Modal v-model:open="open" size="sm">
  <Modal.Header><Modal.Title>Delete project</Modal.Title></Modal.Header>
  <Modal.Body><p>This action cannot be undone.</p></Modal.Body>
  <Modal.Footer>
    <Button variant="ghost" @click="open = false">Cancel</Button>
    <Button variant="destructive" @click="remove">Delete</Button>
  </Modal.Footer>
</Modal>
```

Sub-components hang off `Modal` rather than being separate imports; Vue templates
resolve dot notation, so this matches the upstream React contract exactly.
