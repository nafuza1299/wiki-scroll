/*
  Formatters are hoisted to module scope: constructing an Intl formatter is
  expensive enough that doing it per render, per card, is worth avoiding.
*/
const viewFormatter = new Intl.NumberFormat("en-US", { notation: "compact" });
const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/**
 * Returns null rather than the string "Invalid Date", which is what
 * `new Date(bad).toLocaleDateString()` renders and what this app used to show.
 * A caller that gets null omits the field instead of displaying nonsense.
 */
export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : null;
}

export function formatViews(count: number | null): string {
  return count === null ? "views unavailable" : `${viewFormatter.format(count)} views / 30d`;
}
