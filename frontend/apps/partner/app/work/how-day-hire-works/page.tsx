import type { Metadata } from "next";
import Link from "next/link";

import { PartnerShell } from "@/features/session/partner-shell";

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

export default function HowDayHireWorksPage() {
  return (
    <PartnerShell requirePartnerRole>
      <main className="flex min-h-[calc(100dvh-9rem)] flex-col gap-5 bg-canvas px-4 py-5">
        <div className="flex flex-col gap-1">
          <Link
            href="/work"
            className="w-fit text-sm font-semibold text-action-secondary underline-offset-2 hover:underline"
          >
            ← Work
          </Link>
          <h1 className="text-2xl font-extrabold leading-tight text-text">How day-hire works</h1>
        </div>

        <Section title="The offer">
          <p>An offer is a crew size, a number of days, an area and a rate.</p>
          <p>The rate is published by Vsolve for your city and skill. It is the same for every lead.</p>
          <p>The first lead to take it gets it. The clock on the offer is real minutes, day or night.</p>
        </Section>

        <Section title="Taking it">
          <p>Taking the job is taking the published rate. Nothing to quote, nothing to negotiate on site.</p>
          <p>Extras — overtime, an add-on — go through the app at the published rates and count only once the customer approves them.</p>
          <p>Asking for money above the rate, or cash on the side, is something the customer can report in one tap.</p>
        </Section>

        <Section title="Held, then confirmed">
          <p>When you take it first, the job is held for you while the customer pays the booking fee.</p>
          <p>Don&apos;t travel and don&apos;t line up your crew on a hold. We ping you the moment it is confirmed.</p>
          <p>If the customer never pays, the hold lapses on its own. Nothing is charged, nothing is owed, nothing counts against you.</p>
        </Section>

        <Section title="Your money">
          <p>The customer pays you directly, each evening, for the people who came that day.</p>
          <p>Vsolve never holds this money. The booking fee is the only thing Vsolve collects, and the customer pays it.</p>
          <p>Each evening both of you get a one-tap prompt at the published amount. Tap it once you are paid; it stays open until you both do.</p>
        </Section>

        <Section title="Each day">
          <p>Name the crew before the day. Tap &ldquo;We&apos;ve reached&rdquo; when you arrive.</p>
          <p>In the evening, tick who came and add any extra hours. The app sends the day&apos;s amount to the customer.</p>
          <p>The customer confirms the count. If they disagree, support looks at it — the other days carry on.</p>
        </Section>

        <Section title="Passing on an offer">
          <p>Passing needs a reason, and the reason is read.</p>
          <p>&ldquo;Rate too low&rdquo; is the one Vsolve acts on fastest: enough of them at one rate and Operations reviews it for your city.</p>
          <p>Passing never counts against you.</p>
        </Section>

        <Section title="Problems">
          <p>Fewer people, a locked gate, an injury, a site that is not ready — use the Problem button on the job.</p>
          <p>A safety report never cancels the job. To cancel a job, call support.</p>
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
