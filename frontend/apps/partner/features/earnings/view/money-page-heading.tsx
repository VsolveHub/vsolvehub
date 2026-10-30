"use client";

import { useT } from "@vsolve/ui";

/**
 * The `sr-only` `<h1>` for `/money`.
 *
 * Pulled out of `app/money/page.tsx` into its own client component only so it
 * can call `useT()` — the page itself is a server component (it exports
 * `metadata`, which a `"use client"` file cannot do), so the translated
 * heading has to live one level down.
 */
export function MoneyPageHeading() {
  const t = useT();
  return <h1 className="sr-only">{t("money.page.heading")}</h1>;
}
