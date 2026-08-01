"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * Message-key plumbing.
 *
 * Milestone 1 ships English only (plan 09 §15). The point of adding this now is
 * that retrofitting i18n after three applications are built is expensive, while
 * adding the seam up front costs almost nothing. Telugu and Hindi can then land
 * as catalogue files without touching a single component.
 *
 * Deliberately not a library. A dependency would bring a loader, a plugin, a
 * config format and a bundle cost to solve a problem this product does not have
 * yet. What it does need is: keys instead of literals, correct plural rules for
 * languages whose rules are not English's, and a fallback that never renders
 * blank.
 *
 * `@vsolve/query` already emits stable `messageKey` values on every error, so
 * error copy flows through here without further work.
 */

export type Locale = "en-IN" | "te-IN" | "hi-IN";

export const DEFAULT_LOCALE: Locale = "en-IN";

/**
 * A message is either a plain string or plural forms keyed by CLDR category.
 * `other` is mandatory — it is the only category every language has.
 */
export type Message = string | ({ other: string } & Partial<Record<Intl.LDMLPluralRule, string>>);

export type Catalog = Record<string, Message>;

export interface Translator {
  locale: Locale;
  /**
   * Resolves a key.
   *
   * `params` values are interpolated into `{name}` placeholders. When `count` is
   * present the plural form is selected using the locale's own rules, not an
   * English `n === 1` check.
   */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Locale-aware number formatting, so Indian grouping is applied. */
  n: (value: number, options?: Intl.NumberFormatOptions) => string;
}

const I18nContext = createContext<Translator | null>(null);

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function createTranslator(locale: Locale, catalog: Catalog): Translator {
  const pluralRules = new Intl.PluralRules(locale);
  const numberFormat = new Intl.NumberFormat(locale);

  const t: Translator["t"] = (key, params) => {
    const entry = catalog[key];

    if (entry === undefined) {
      // Rendering the key is intentional. A blank string hides the problem in
      // production and an exception takes the screen down; a visible key gets
      // reported and fixed.
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[i18n] Missing message for key "${key}" in ${locale}.`);
      }
      return key;
    }

    if (typeof entry === "string") return interpolate(entry, params);

    const count = params?.count;
    if (typeof count !== "number") {
      // A plural message used without a count cannot pick a form; `other` is the
      // safe choice rather than guessing.
      return interpolate(entry.other, params);
    }

    const category = pluralRules.select(count);
    const template = entry[category] ?? entry.other;
    return interpolate(template, params);
  };

  return {
    locale,
    t,
    n: (value, options) =>
      options ? new Intl.NumberFormat(locale, options).format(value) : numberFormat.format(value),
  };
}

export function I18nProvider({
  locale = DEFAULT_LOCALE,
  catalog,
  children,
}: {
  locale?: Locale;
  catalog: Catalog;
  children: ReactNode;
}) {
  const translator = useMemo(() => createTranslator(locale, catalog), [locale, catalog]);
  return <I18nContext.Provider value={translator}>{children}</I18nContext.Provider>;
}

/**
 * Returns the active translator.
 *
 * Falls back to an English translator with an empty catalogue when no provider
 * is mounted, so a component rendered in isolation — a test, a docs page —
 * shows its keys instead of crashing.
 */
export function useTranslator(): Translator {
  const context = useContext(I18nContext);
  return useMemo(
    () => context ?? createTranslator(DEFAULT_LOCALE, {}),
    [context],
  );
}

/** Convenience hook for the common case. */
export function useT(): Translator["t"] {
  return useTranslator().t;
}
