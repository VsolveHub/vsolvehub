/**
 * The pure half of `i18n.tsx`: types and `createTranslator`, with no React and
 * no "use client", so server components can build a translator too. A
 * function exported from a "use client" module becomes a client reference and
 * throws when a server component calls it.
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

export function interpolate(template: string, params?: Record<string, string | number>): string {
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

