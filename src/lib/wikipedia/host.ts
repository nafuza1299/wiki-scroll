/*
  The one place a Wikipedia language edition becomes a hostname.

  Every other Wikipedia file used to hardcode `en.wikipedia.org` as a module
  constant — three separate times (queries.ts, html.ts, and a third copy baked
  into App.vue's cold-deep-link fallback). Centralising it here means a language
  switcher is one new parameter threaded through, not three places that could
  quietly disagree about which language is "current".
*/

export function restBase(lang: string): string {
  return `https://${lang}.wikipedia.org/api/rest_v1`;
}

export function actionBase(lang: string): string {
  return `https://${lang}.wikipedia.org/w/api.php`;
}
