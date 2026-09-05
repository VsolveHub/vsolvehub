"use client";

import { Button, buttonStyles, cn } from "@vsolve/ui";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { firstStageOf, type QuoteCardView } from "../adapters";
import { timelineLabel, validityLabel } from "./quote-card";

/**
 * The decision, kept on screen while the document is read.
 *
 * A docked bar across the bottom is a phone affordance — it exists because a
 * phone has no room to put anything beside the content. A wide screen does,
 * and a rail is strictly better there: it holds the whole verdict rather than
 * one line of it, it gives the scattered mid-page actions a home, and it can
 * carry navigation for a document that takes three minutes to read.
 *
 * Rendered only at `lg` and up. Below that the sticky bar does this job, and
 * the jump-nav is dropped entirely rather than shrunk into something nobody
 * can hit with a thumb.
 */
export function DecisionRail({
  card,
  confirmHref,
  questionsHref,
  chooseable,
  canAskPrice,
  onAskAboutPrice,
  onReject,
  sections,
}: {
  card: QuoteCardView;
  confirmHref: string;
  questionsHref: string;
  chooseable: boolean;
  canAskPrice: boolean;
  onAskAboutPrice: () => void;
  onReject: () => void;
  /** `[id, label]` for each band on the page, in document order. */
  sections: readonly { id: string; label: string }[];
}) {
  const firstStage = firstStageOf(card);
  const timeline = timelineLabel(card);
  const validity = validityLabel(card);
  const openQuestions = card.questions.filter(
    (question) => question.askedByRole === "VENDOR" && question.answer === null,
  ).length;

  return (
    <aside className="sticky top-6 hidden flex-col gap-4 lg:flex">
      <section className="rounded-[18px] bg-navy-900 p-5 text-white">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-signal-300">
          {card.discountPaise > 0 ? "Discounted estimate" : "Their estimate"}
        </p>
        <p className="mt-2 text-[32px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">
          {card.payableLabel}
        </p>
        {card.discountPaise > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="tabular-nums text-white/60 line-through">
              {card.discountBaseLabel}
            </span>
            <span className="font-bold text-success-200">You save {card.discountLabel}</span>
          </div>
        ) : null}
        <p className="mt-2 text-sm text-white/75">
          {card.taxBasis === "INCLUSIVE"
            ? `Includes ${card.taxLabel} tax`
            : `Includes ${card.taxLabel} tax added to service rates`}
          {validity !== null ? ` · ${validity.text.toLowerCase()}` : ""}
        </p>

        <dl className="mt-4 grid gap-3 border-t border-white/10 pt-4">
          <RailFact label="To start" value={firstStage?.amountLabel ?? "Not stated"} />
          <RailFact label="Takes" value={timeline ?? "Not stated"} />
        </dl>

        {chooseable ? (
          <>
            <Link
              href={confirmHref}
              className="mt-4 flex min-h-11 items-center justify-center rounded-control bg-action px-4 text-sm font-extrabold text-action-text transition-colors hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              Choose
              <span aria-hidden className="ml-1.5 text-base leading-none">›</span>
            </Link>
            <p className="mt-2 text-center text-xs text-white/60">Nothing is charged now.</p>
          </>
        ) : null}

        {canAskPrice ? (
          <button
            type="button"
            onClick={onAskAboutPrice}
            className="mt-3 flex w-full items-center justify-between gap-2 border-t border-white/10 pt-3 text-left text-sm font-bold text-signal-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            Any negotiations?
            <span aria-hidden className="text-base leading-none">→</span>
          </button>
        ) : null}
      </section>

      {sections.length > 0 ? (
        <nav aria-label="On this page" className="rounded-[14px] border border-line bg-surface p-4">
          <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-text-muted">
            On this page
          </p>
          <ul className="mt-2 flex list-none flex-col p-0">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="block rounded-[8px] px-2 py-1.5 text-sm font-semibold text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="flex flex-col gap-2">
        <Link
          href={questionsHref}
          className={cn(buttonStyles({ variant: "outline" }), "justify-center")}
        >
          <MessageCircle className="size-4" aria-hidden />
          Ask them a question{openQuestions > 0 ? ` (${openQuestions} waiting)` : ""}
        </Link>
        {chooseable ? (
          <Button variant="ghost" onClick={onReject}>
            Not this one
          </Button>
        ) : null}
      </div>
    </aside>
  );
}

function RailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/60">{label}</dt>
      <dd className="text-base font-extrabold tabular-nums">{value}</dd>
    </div>
  );
}
