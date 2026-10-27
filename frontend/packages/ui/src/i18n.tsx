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

import {
  createTranslator,
  DEFAULT_LOCALE,
  interpolate,
  type Catalog,
  type Locale,
  type Translator,
} from "./i18n-core";

export type { Catalog, Locale, Message, Translator } from "./i18n-core";

const I18nContext = createContext<Translator | null>(null);

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

/**
 * For components shared across apps that do not all mount an `I18nProvider`
 * (customer, admin). Without a provider `t` falls back to an empty English
 * catalogue and returns the key itself — correct for a component that owns
 * its own strings as literals, wrong for a shared one whose only "default"
 * is that literal. This resolves the real translation when the host app's
 * catalogue has one, and the literal `fallback` otherwise, so an app with no
 * catalogue entry (or no provider at all) never shows a raw key.
 */
export function useTOrDefault(): (
  key: string,
  fallback: string,
  params?: Record<string, string | number>,
) => string {
  const { t } = useTranslator();
  return (key, fallback, params) => {
    const resolved = t(key, params);
    // The fallback carries the same `{placeholders}` as a catalogue entry would, so it is
    // interpolated the same way — otherwise an app with no entry shows "{codeLength}-digit code".
    return resolved === key ? interpolate(fallback, params) : resolved;
  };
}
