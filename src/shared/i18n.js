import { fr } from "./locales/fr.js";
import { en } from "./locales/en.js";

const TRANSLATIONS = { fr, en };
const LOCALE_STORAGE_KEY = "dnd-companion-locale";

let locale = localStorage.getItem(LOCALE_STORAGE_KEY) || "fr";

export function getLocale() {
  return locale;
}

/** Persist and apply a new locale (does NOT trigger re-render — caller must do that). */
export function setLocale(newLocale) {
  if (!TRANSLATIONS[newLocale]) return;
  locale = newLocale;
  localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
}

/**
 * Translate a key, with optional named-param interpolation.
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function t(key, params = {}) {
  const map = TRANSLATIONS[locale] ?? TRANSLATIONS.fr;
  let str = map[key] ?? TRANSLATIONS.fr[key] ?? key;

  for (const [k, v] of Object.entries(params)) {
    str = str.replaceAll(`{${k}}`, v != null ? String(v) : "");
  }

  return str;
}
