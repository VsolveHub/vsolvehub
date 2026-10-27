import type { Metadata } from "next";
import Link from "next/link";

import { getServerTranslator } from "@/i18n/server";

// Without this the 404 carried the home page's title, so the tab read as if it had loaded.
export const metadata: Metadata = { title: "Page not found" };

export default async function NotFound() {
  const { t } = await getServerTranslator();
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">
        {t("common.notFound.eyebrow")}
      </p>
      <h1 className="mt-3 text-2xl font-bold text-ink-900">{t("common.notFound.title")}</h1>
      <p className="mt-3 text-sm text-gray-500">
        {t("common.notFound.message")}
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        {t("common.notFound.backHome")}
      </Link>
    </main>
  );
}
