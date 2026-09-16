/*
  A curated list, not a live search against the Wikipedia API.

  Mirrors the tradeoff LANGUAGES makes in ./languages.ts: a live-suggest
  combobox (like SearchBar's, backed by action=opensearch) would surface more
  categories, but costs a fetch, a debounce/abort dance, and a network
  round-trip for a field that already works perfectly well as free text — the
  dropdown here is pure convenience, not the only way in. A dozen or so
  popular top-level categories covers the common case; anything else is still
  just typed in directly, exactly as before this file existed.

  English only, deliberately: category names are wiki-language-specific text
  ("Physics" on en.wikipedia.org is "Physique" on fr.wikipedia.org), and this
  list is only written in English. CategoryFilter only offers it when
  lang === "en" for that reason — offering it for another language would mean
  suggesting a name that silently returns zero results there.

  Not verified against the live Wikipedia API — written without network
  access to en.wikipedia.org. A reasonable starting set of plausible
  top-level categories, worth swapping for API-confirmed ones later.
*/
export const CATEGORIES: readonly string[] = [
  "Physics",
  "Chemistry",
  "Biology",
  "Mathematics",
  "History",
  "Geography",
  "Astronomy",
  "Computer science",
  "Philosophy",
  "Literature",
  "Art",
  "Music",
  "Film",
  "Sports",
];
