/*
  A curated list, not all ~300 Wikipedia editions.

  A searchable combobox over the full sitematrix would serve niche languages
  better, but it costs a fetch-and-cache step and more UI for a repo that is
  deliberately kept to one runtime dependency. Twelve languages covering most
  traffic is the tradeoff; extending the list later is a one-line change.
*/
export interface Language {
  code: string;
  label: string;
}

export const LANGUAGES: readonly Language[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "ru", label: "Русский" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
  { code: "ar", label: "العربية" },
  { code: "hi", label: "हिन्दी" },
  { code: "ko", label: "한국어" },
];

/** Guards `?lang=` before it ever reaches a URL builder — an unsupported or
 *  attacker-controlled code falls back to "en" at the route layer rather than
 *  each caller having to validate it separately. */
export function isSupportedLang(code: string): boolean {
  return LANGUAGES.some((language) => language.code === code);
}
