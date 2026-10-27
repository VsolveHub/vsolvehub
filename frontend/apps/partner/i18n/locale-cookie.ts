import type { Locale } from "@vsolve/ui";

/**
 * The one place that knows the cookie's name and shape, so the server
 * (`app/layout.tsx`, via `next/headers`) and the client (`PartnerI18nProvider`)
 * can never disagree on it.
 */
export const LOCALE_COOKIE_NAME = "vsh-partner-locale";

const VALID_LOCALES: readonly Locale[] = ["en-IN", "te-IN", "hi-IN"];

export function parseLocale(value: string | undefined | null): Locale | null {
  return value !== undefined && value !== null && (VALID_LOCALES as readonly string[]).includes(value)
    ? (value as Locale)
    : null;
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Client-only. Writes the cookie so the next full page load (and the server
 * layout) picks up the choice without needing a round trip. */
export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}
