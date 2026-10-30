"use client";

// Last-resort boundary: catches errors thrown in the root layout itself, where
// the normal error.tsx cannot render. Must ship its own <html>/<body>.
// Without this, an unhandled server error shows Next's raw
// "Application error: a server-side exception has occurred" screen.
import { useEffect, useMemo } from "react";
import { createTranslator, DEFAULT_LOCALE } from "@vsolve/ui";

import { catalogs } from "@/i18n/catalogs";
import { LOCALE_COOKIE_NAME, parseLocale } from "@/i18n/locale-cookie";

/**
 * No `PartnerI18nProvider` is mounted here — this boundary replaces the root
 * layout that holds it — so the language is read straight off the cookie the
 * layout would have read.
 */
function readCookieLocale() {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const entry = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${LOCALE_COOKIE_NAME}=`));
  return parseLocale(entry?.slice(LOCALE_COOKIE_NAME.length + 1)) ?? DEFAULT_LOCALE;
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale, t } = useMemo(() => {
    const cookieLocale = readCookieLocale();
    return createTranslator(cookieLocale, catalogs[cookieLocale]);
  }, []);

  useEffect(() => {
    // Surfaces in Vercel logs alongside the digest so it can be traced.
    console.error("[global-error]", error.digest, error);
  }, [error]);

  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#f6f7f9",
          color: "#0f172a",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
            {t("common.somethingWentWrong")}
          </h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 20px" }}>
            {t("common.errorBoundary.globalMessage")}
          </p>
          <button
            onClick={reset}
            style={{
              appearance: "none",
              border: "none",
              borderRadius: 10,
              padding: "12px 20px",
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
              background: "#002870",
              cursor: "pointer",
            }}
          >
            {t("common.tryAgain")}
          </button>
          {error.digest ? (
            <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 16 }}>
              {t("common.errorBoundary.reference", { digest: error.digest })}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
