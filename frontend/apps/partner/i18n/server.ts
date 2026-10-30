import { cookies } from "next/headers";
import { createTranslator, DEFAULT_LOCALE, type Translator } from "@vsolve/ui";

import { catalogs } from "./catalogs";
import { LOCALE_COOKIE_NAME, parseLocale } from "./locale-cookie";

/**
 * For server components, which cannot call `useT()`. Reads the same cookie the
 * root layout does, so a server-rendered line and the client tree around it
 * always agree on the language. A language switch on the client re-renders
 * client components at once; server-rendered text follows on the next
 * navigation or `router.refresh()`, which the locale switcher triggers.
 */
export async function getServerTranslator(): Promise<Translator> {
  const cookieStore = await cookies();
  const locale = parseLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE;
  return createTranslator(locale, catalogs[locale]);
}
