import type { Metadata } from "next";
import Link from "next/link";

import { PartnerShell } from "@/features/session/partner-shell";
import { getServerTranslator } from "@/i18n/server";

/**
 * The one page that explains day-hire.
 *
 * Every screen on the A3 path — the offer, the confirm, the held win, the job
 * hub, the day — keeps each line to one sentence. The explanations that used to
 * sit beside those lines (`ACCEPT_COMMITMENT`, `WAGE_SETTLEMENT`, the hold
 * window, the decline alarm) live here instead, as short headed sections, and
 * the offer and the hub each link here once.
 *
 * Static and unpersonalised, but mounted inside `PartnerShell requirePartnerRole`
 * like the rest of `/work/*` so it sits in the same chrome a lead reaches it
 * from. Nothing here is a number: every ₹ figure a lead sees is on the screen
 * that publishes it.
 */
export const metadata: Metadata = {
  title: "How day-hire works",
  robots: { index: false, follow: false },
};

export default async function HowDayHireWorksPage() {
  const { t } = await getServerTranslator();
  return (
    <PartnerShell requirePartnerRole>
      <main className="flex min-h-[calc(100dvh-9rem)] flex-col gap-5 bg-canvas px-4 py-5">
        <div className="flex flex-col gap-1">
          <Link
            href="/work"
            className="w-fit text-sm font-semibold text-action-secondary underline-offset-2 hover:underline"
          >
            {t("offers.howDayHire.back")}
          </Link>
          <h1 className="text-2xl font-extrabold leading-tight text-text">
            {t("offers.howDayHire.title")}
          </h1>
        </div>

        <Section title={t("offers.howDayHire.offer.title")}>
          <p>{t("offers.howDayHire.offer.p1")}</p>
          <p>{t("offers.howDayHire.offer.p2")}</p>
          <p>{t("offers.howDayHire.offer.p3")}</p>
        </Section>

        <Section title={t("offers.howDayHire.taking.title")}>
          <p>{t("offers.howDayHire.taking.p1")}</p>
          <p>{t("offers.howDayHire.taking.p2")}</p>
          <p>{t("offers.howDayHire.taking.p3")}</p>
        </Section>

        <Section title={t("offers.howDayHire.held.title")}>
          <p>{t("offers.howDayHire.held.p1")}</p>
          <p>{t("offers.howDayHire.held.p2")}</p>
          <p>{t("offers.howDayHire.held.p3")}</p>
        </Section>

        <Section title={t("offers.howDayHire.money.title")}>
          <p>{t("offers.howDayHire.money.p1")}</p>
          <p>{t("offers.howDayHire.money.p2")}</p>
          <p>{t("offers.howDayHire.money.p3")}</p>
        </Section>

        <Section title={t("offers.howDayHire.eachDay.title")}>
          <p>{t("offers.howDayHire.eachDay.p1")}</p>
          <p>{t("offers.howDayHire.eachDay.p2")}</p>
          <p>{t("offers.howDayHire.eachDay.p3")}</p>
        </Section>

        <Section title={t("offers.howDayHire.passing.title")}>
          <p>{t("offers.howDayHire.passing.p1")}</p>
          <p>{t("offers.howDayHire.passing.p2")}</p>
          <p>{t("offers.howDayHire.passing.p3")}</p>
        </Section>

        <Section title={t("offers.howDayHire.problems.title")}>
          <p>{t("offers.howDayHire.problems.p1")}</p>
          <p>{t("offers.howDayHire.problems.p2")}</p>
        </Section>
      </main>
    </PartnerShell>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-card border border-line bg-surface px-4 py-3.5">
      <h2 className="text-base font-bold text-text">{title}</h2>
      <div className="flex flex-col gap-1.5 text-sm leading-6 text-text-secondary">{children}</div>
    </section>
  );
}
