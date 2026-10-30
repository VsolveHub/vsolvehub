import { I18nProvider, type Locale } from "@vsolve/ui";
import type { ReactNode } from "react";

import { catalogs } from "./catalogs";

/**
 * Tests render components on their own, outside `app/layout.tsx`, so nothing
 * mounts the provider — and without it every `t()` call renders its raw key.
 * Wrap the tree in this to get the real (English by default) catalogue.
 */
export function withI18n(ui: ReactNode, locale: Locale = "en-IN") {
  return (
    <I18nProvider locale={locale} catalog={catalogs[locale]}>
      {ui}
    </I18nProvider>
  );
}
