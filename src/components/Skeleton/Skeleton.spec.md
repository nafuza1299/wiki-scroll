# Skeleton

An animated placeholder standing in for content that has not loaded yet.

## Props

| Prop    | Type                           | Default  | Notes                                                                          |
| ------- | ------------------------------ | -------- | ------------------------------------------------------------------------------ |
| `shape` | `"text" \| "circle" \| "rect"` | `"text"` | `text` is a single line; `circle` needs a width; `rect` needs both dimensions. |
| `label` | `string`                       | —        | Supply on **one** skeleton per loading region, not every one.                  |

Sizing comes from `class` — `shape` only sets the silhouette.

## Behavior and accessibility

- Decorative by default: `aria-hidden="true"`, so a screen reader is not read a
  wall of meaningless placeholders.
- Passing `label` flips it to `role="status"` with that accessible name, which is
  what actually announces the wait. Exactly one per region.
- The pulse is disabled under `prefers-reduced-motion`.

## Do / Don't

- Do mirror the real content's shape, so nothing jumps when it arrives.
- Do label one skeleton per region and leave the rest decorative.
- Don't use it for content that failed to load — that is an error state, not a wait.

## Usage

```vue
<Skeleton shape="rect" class="h-44 w-full rounded-2xl" label="Loading articles" />
<Skeleton class="w-3/4" />
<Skeleton class="w-1/2" />
```
