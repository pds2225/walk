import type { Locale } from "./i18n";

const LOCALE_STORAGE_KEY = "walk:locale";
const SUPPORTED_LOCALES: readonly Locale[] = ["ko", "en", "ja", "zh"];

function isLocale(value: string | null | undefined): value is Locale {
  return value !== null && value !== undefined && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function localeFromSearch(search: string): Locale | null {
  const value = new URLSearchParams(search).get("lang");
  return isLocale(value) ? value : null;
}

export function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    return isLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY)) ? (window.localStorage.getItem(LOCALE_STORAGE_KEY) as Locale) : null;
  } catch {
    // Storage can be unavailable (private mode, quota). Fall through to other sources.
    return null;
  }
}

export function writeStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Losing persistence is acceptable; the URL/session still carries the choice.
  }
}

export function localeFromBrowserLanguages(languages: readonly string[]): Locale | null {
  for (const language of languages) {
    const lower = language.toLowerCase();
    if (lower.startsWith("ko")) return "ko";
    if (lower.startsWith("ja")) return "ja";
    if (lower.startsWith("zh")) return "zh";
    if (lower.startsWith("en")) return "en";
  }
  return null;
}

/** Priority: URL ?lang= > stored choice > browser language > ko. */
export function resolveInitialLocale(): Locale {
  if (typeof window === "undefined") return "ko";
  const languages = window.navigator.languages?.length ? window.navigator.languages : [window.navigator.language];
  return (
    localeFromSearch(window.location.search)
    ?? readStoredLocale()
    ?? localeFromBrowserLanguages(languages)
    ?? "ko"
  );
}

/** Reflects the chosen locale in the URL without creating a history entry. */
export function syncLocaleToUrl(locale: Locale): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("lang", locale);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}
