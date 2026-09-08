# Notice

A block that explains why there is nothing to look at — a failed load, an empty
result, the end of a feed — with an optional action.

## Props

| Prop      | Type                   | Default     | Notes                                                                         |
| --------- | ---------------------- | ----------- | ----------------------------------------------------------------------------- |
| `title`   | `string`               | required    | One line. What happened, in the user's terms.                                 |
| `message` | `string`               | —           | Optional detail. Skip it when the title says everything.                      |
| `tone`    | `"error" \| "neutral"` | `"neutral"` | `error` colours the title and announces assertively.                          |
| `compact` | `boolean`              | `false`     | Inline padding, for a notice sitting inside a list rather than replacing one. |

The default slot holds actions — usually a single `Button`.

## Behavior and accessibility

- `tone="error"` renders `role="alert"` + `aria-live="assertive"`: a failure the
  user did not ask for should interrupt. `neutral` uses `role="status"` +
  `aria-live="polite"`, which waits for a pause.
- The action lives in the slot rather than as a prop, so the caller owns the
  label and the handler. "Try again" and "Clear search" are the same component.

## Do / Don't

- Do write the title as an outcome ("Couldn't reach Wikipedia"), not a code.
- Do use `compact` for a notice appended to an existing list, so it does not
  claim a whole screen.
- Don't use `error` for an empty search result — nothing failed.

## Usage

```vue
<Notice tone="error" title="Couldn't load articles" :message="error ?? undefined">
  <Button @click="retry">Try again</Button>
</Notice>

<Notice compact title="No more articles to load." />
```
