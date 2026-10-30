"use client";

import { I18nProvider, type Locale } from "@vsolve/ui";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { catalogs } from "./catalogs";
import { writeLocaleCookie } from "./locale-cookie";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Mounted once, at the app root (`app/layout.tsx`), above everything else.
 *
 * `initialLocale` comes from the cookie read server-side so the first paint
 * already renders in the right language — there is no English flash before a
 * client effect corrects it. Switching languages afterwards is a state update,
 * not a navigation: every mounted screen re-renders in the new language
 * immediately, and the cookie write is what makes the choice survive the next
 * full refresh or a fresh tab.
 */
export function PartnerI18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // The server sets `<html lang>` from the cookie on first paint; keep it true
  // after a client-side switch so screen readers and Telugu/Hindi font
  // shaping follow the visible text.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      writeLocaleCookie(next);
      // Client components switch in this render; the refresh re-renders the
      // few server components (`i18n/server.ts`) with the new cookie.
      router.refresh();
    },
    [router],
  );

  const contextValue = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={contextValue}>
      <I18nProvider locale={locale} catalog={catalogs[locale]}>
        {children}
      </I18nProvider>
    </LocaleContext.Provider>
  );
}

/** The active locale and the one way to change it. */
export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (context === null) {
    throw new Error("useLocale must be used within PartnerI18nProvider");
  }
  return context;
}
