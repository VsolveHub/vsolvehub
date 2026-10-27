import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { Medallion, type Tone } from "./graphics";

export interface LegalSection {
  heading: string;
  body: React.ReactNode;
}

/** Shared layout for long-form legal pages (Terms, Privacy). Renders inside the
 *  marketing layout, so the site header/footer wrap it. */
export function LegalPage({
  title,
  updated,
  intro,
  icon,
  tone = "brand",
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  icon: LucideIcon;
  tone?: Tone;
  sections: LegalSection[];
}) {
  return (
    <main className="px-5 pt-24 sm:pt-28 lg:pt-32 pb-20">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <div className="mt-6 flex items-center gap-4">
          <Medallion icon={icon} tone={tone} size={64} />
          <div>
            <h1 className="text-3xl font-bold text-ink-900 sm:text-4xl">{title}</h1>
            <p className="mt-1 text-sm text-gray-400">Last updated {updated}</p>
          </div>
        </div>

        <p className="mt-8 text-base leading-relaxed text-gray-600">{intro}</p>

        <div className="mt-10 space-y-9">
          {sections.map((s, i) => (
            <section key={s.heading}>
              <h2 className="text-lg font-semibold text-ink-900">
                {i + 1}. {s.heading}
              </h2>
              <div className="mt-2 space-y-3 text-sm leading-relaxed text-gray-600 [&_a]:font-medium [&_a]:text-brand-600 [&_a:hover]:underline [&_li]:ml-1 [&_strong]:text-ink-900">
                {s.body}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-12 rounded-xl border border-border bg-surface-muted/60 p-4 text-xs leading-relaxed text-gray-400">
          This document is provided for the V Solve Hub partner programme and does not constitute
          legal advice. For questions, contact us at{" "}
          <a href="mailto:support@vsolvehub.com" className="font-medium text-brand-600 hover:underline">
            support@vsolvehub.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
