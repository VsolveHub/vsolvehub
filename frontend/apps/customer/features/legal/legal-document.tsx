import Link from "next/link";
import type { ReactNode } from "react";

import { SUPPORT } from "@/lib/support";

export interface LegalSection {
  /** Anchor id, so a section can be linked to directly (`/refund-policy#crew`). */
  id: string;
  title: string;
  body: ReactNode;
}

/**
 * The shared shape of the Terms, Privacy and Refund & Cancellation pages.
 *
 * One layout, so the three documents a customer (or Razorpay's reviewer) reads side by side look
 * like they came from one company, and the contact block at the foot of each is the same
 * `SUPPORT` record the Contact page uses.
 */
export function LegalDocument({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  /** Human-readable date the text last changed, e.g. "26 October 2026". */
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <main className="min-h-screen bg-[#FAF9F7] pb-16">
      <div className="relative overflow-hidden bg-[#041227] px-4 py-16 text-white sm:px-6">
        <div className="absolute inset-0 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />
        <div className="relative z-10 mx-auto flex max-w-[1216px] flex-col items-center text-center">
          <Link
            href="/"
            className="group mb-6 inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-[#8EA2C6] uppercase transition-colors hover:text-white"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="size-3.5 rotate-180 transition-transform group-hover:-translate-x-0.5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4 10h11m-4-4 4 4-4 4" />
            </svg>
            Back to Home
          </Link>
          <span className="mb-3 rounded-full border border-[#EA580C]/20 bg-[#EA580C]/10 px-3 py-1 text-[10px] font-extrabold tracking-[0.2em] text-[#EA580C] uppercase">
            Legal & Policies
          </span>
          <h1 className="mb-3 text-3xl font-black tracking-tight text-white sm:text-4xl">{title}</h1>
          <p className="text-xs font-medium text-[#A9B9D1]">Last updated: {updated}</p>
        </div>
      </div>

      <div className="mx-auto max-w-[1216px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start gap-10 lg:flex-row">
          <aside className="flex w-full flex-col gap-4 rounded-2xl border border-[#e7e2da] bg-white p-5 shadow-2xs lg:sticky lg:top-24 lg:w-3/12">
            <h2 className="border-b border-navy-900/10 pb-2.5 text-xs font-bold tracking-wider text-navy-900 uppercase">
              Sections
            </h2>
            <nav className="flex flex-col gap-1.5" aria-label={`${title} sections`}>
              {sections.map((section, index) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:bg-navy-50/50 hover:text-[#EA580C]"
                >
                  <span>{section.title}</span>
                  <span className="font-mono text-[10px] font-bold text-text-secondary/50">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </a>
              ))}
            </nav>
          </aside>

          <div className="flex w-full flex-col gap-6 lg:w-9/12">
            <div className="rounded-2xl border border-[#e7e2da] bg-white p-6 text-sm leading-relaxed font-medium text-text-secondary shadow-card sm:p-8 [&_a]:font-semibold [&_a]:text-action [&_a]:underline-offset-2 hover:[&_a]:underline [&_p+p]:mt-3">
              {intro}
            </div>

            {sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                className="flex scroll-mt-24 flex-col gap-4 rounded-2xl border border-[#e7e2da] bg-white p-6 shadow-card sm:p-8"
              >
                <div className="flex items-center gap-4 border-b border-navy-900/5 pb-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#EBF0FE] font-mono text-xs font-bold text-[#2563EB] shadow-2xs">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2 className="text-lg leading-tight font-extrabold text-[#00112e]">
                    {section.title}
                  </h2>
                </div>
                <div className="space-y-3 text-sm leading-relaxed font-medium text-text-secondary [&_a]:font-semibold [&_a]:text-action [&_a]:underline-offset-2 hover:[&_a]:underline [&_h3]:pt-2 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-navy-900 [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_strong]:text-navy-900 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
                  {section.body}
                </div>
              </section>
            ))}

            <div className="rounded-2xl border border-dashed border-[#EA580C]/30 bg-[#EA580C]/5 p-6 text-sm font-medium text-text-secondary sm:p-8">
              <h2 className="text-base font-extrabold text-navy-900">Questions about this page?</h2>
              <p className="mt-2 leading-relaxed">
                Write to{" "}
                <a className="font-semibold text-action" href={`mailto:${SUPPORT.email}`}>
                  {SUPPORT.email}
                </a>
                {SUPPORT.phone ? (
                  <>
                    , call or WhatsApp{" "}
                    <a className="font-semibold text-action" href={SUPPORT.phone.telHref}>
                      {SUPPORT.phone.display}
                    </a>{" "}
                    ({SUPPORT.phoneHours})
                  </>
                ) : null}
                , or use the{" "}
                <Link className="font-semibold text-action" href="/contact">
                  contact form
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
