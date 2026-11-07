// Ported from frontend/packages/ui/src/i18n.tsx
import { createContext, useContext, useMemo, type ReactNode } from "react";

export type Locale = "en-IN" | "te-IN" | "hi-IN";
export const DEFAULT_LOCALE: Locale = "en-IN";
export type Message = string | ({ other: string } & Partial<Record<Intl.LDMLPluralRule, string>>);
export type Catalog = Record<string, Message>;

export interface Translator {
  locale: Locale;
  t: (key: string, params?: Record<string, string | number>) => string;
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
  let pluralRules: Intl.PluralRules | null = null;
  if (typeof Intl !== "undefined" && typeof Intl.PluralRules === "function") {
    try {
      pluralRules = new Intl.PluralRules(locale);
    } catch {
      pluralRules = null;
    }
  }

  let numberFormat: Intl.NumberFormat | null = null;
  if (typeof Intl !== "undefined" && typeof Intl.NumberFormat === "function") {
    try {
      numberFormat = new Intl.NumberFormat(locale);
    } catch {
      numberFormat = null;
    }
  }

  const selectPlural = (count: number): Intl.LDMLPluralRule => {
    if (pluralRules) {
      try {
        return pluralRules.select(count);
      } catch {
        // fallback below
      }
    }
    // Standard CLDR plural rule fallback for Indian locales (en-IN, te-IN, hi-IN)
    // English (en): 1 -> 'one', otherwise -> 'other'
    // Telugu (te): 1 -> 'one', otherwise -> 'other'
    // Hindi (hi): 0, 1 -> 'one', otherwise -> 'other'
    if (locale === "hi-IN") {
      return count === 0 || count === 1 ? "one" : "other";
    }
    return count === 1 ? "one" : "other";
  };

  const t: Translator["t"] = (key, params) => {
    const entry = catalog[key];
    if (entry === undefined) {
      if (__DEV__) {
        console.warn(`[i18n] Missing message for key "${key}" in ${locale}.`);
      }
      return key;
    }
    if (typeof entry === "string") return interpolate(entry, params);
    const count = params?.count;
    if (typeof count !== "number") return interpolate(entry.other, params);
    const category = selectPlural(count);
    return interpolate(entry[category] ?? entry.other, params);
  };

  return {
    locale,
    t,
    n: (value, options) => {
      if (options && typeof Intl !== "undefined" && typeof Intl.NumberFormat === "function") {
        try {
          return new Intl.NumberFormat(locale, options).format(value);
        } catch {
          // fallback
        }
      }
      if (numberFormat) {
        try {
          return numberFormat.format(value);
        } catch {
          // fallback
        }
      }
      return typeof value.toLocaleString === "function" ? value.toLocaleString(locale) : String(value);
    },
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

export function useTranslator(): Translator {
  const context = useContext(I18nContext);
  return useMemo(() => context ?? createTranslator(DEFAULT_LOCALE, {}), [context]);
}

export function useT(): Translator["t"] {
  return useTranslator().t;
}
