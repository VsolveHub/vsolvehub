import { DEFAULT_LOCALE, type Locale } from "@vsolve/mobile-ui";
import { kvGet, kvSet } from "@vsolve/mobile-core";
import { create } from "zustand";

export const LOCALE_STORAGE_KEY = "vsh-partner-locale";

interface LocaleState {
  locale: Locale;
  isHydrated: boolean;
  setLocale: (locale: Locale) => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: DEFAULT_LOCALE,
  isHydrated: false,
  setLocale: async (locale: Locale) => {
    set({ locale });
    await kvSet(LOCALE_STORAGE_KEY, locale);
  },
  hydrate: async () => {
    if (get().isHydrated) return;
    try {
      const saved = await kvGet(LOCALE_STORAGE_KEY);
      if (saved === "en-IN" || saved === "te-IN" || saved === "hi-IN") {
        set({ locale: saved, isHydrated: true });
        return;
      }
    } catch {
      // Fallback to default
    }
    set({ locale: DEFAULT_LOCALE, isHydrated: true });
  },
}));

export function usePartnerLocale(): [Locale, (next: Locale) => Promise<void>] {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  return [locale, setLocale];
}
