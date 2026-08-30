"use client";

import { Badge, Button, Disclosure, cn } from "@vsolve/ui";
import Link from "next/link";

import { firstStageOf, materialCountLabel, type QuoteCardView } from "../adapters";
import { MaterialListRows } from "./material-list-rows";
import { VendorMark, VendorTrustLine } from "./vendor-trust-line";

/**
 * One estimate, at the size a decision is made at.
 *
 * The card used to be the whole document — every line, stage, material and
 * exclusion behind one disclosure — so three estimates were three screens of
 * prose. The document has its own page now (`EstimateDetailScreen`); the card
 * carries what somebody actually compares: who, how trusted, what it costs,
 * **what it costs to start**, how long, what it leaves out, and how long the
 * price holds.
 *
 * ## There is no paywall state here, and there must never be one
 *
 * `M2-FE-423`. The visit plan (A5) or the unlock (A3) is the access fee, checked
 * once by the server before the payload exists. Nothing downstream re-decides
 * it. Contact details are absent from the response at every status.
 *
 * ## "Leaves out" is a comparison, not a judgement
 *
 * `scopeGaps` names only the lines *other* professionals put in writing that
 * this one did not. It answers "why is this one cheaper" without the screen
 * deciding what a bathroom needs.
 */

export interface QuoteCardProps {
  card: QuoteCardView;
  /** Position in the list, for the accessible heading. */
  index: number;
  /** Where the full estimate is read. */
  detailHref: string;
  /** Where to ask the professional a question. */
  questionsHref: string;
  /** Lines the other estimates include and this one does not. */
  scopeGaps?: readonly string[];

  /**
   * Marks this card as the one the Customer is leaning towards.
   *
   * Picking is **not** choosing. It sets no server state and costs nothing; the
   * commitment is made once, on the confirm screen. Withheld entirely once a
   * real selection exists.
   */
  onPick?: (proposalId: string) => void;
  isPicked: boolean;
  /** The server-persisted choice, distinct from a local pre-selection. */
  isChosen?: boolean;

  onReject?: (proposalId: string) => void;
  onRequestRevision?: (proposalId: string) => void;
  /** `M2-FE-413` — offered only on an expired quote, and it charges nothing. */
  onRevalidate?: (proposalId: string) => void;
  isRevalidating: boolean;
}

/** "Ends 14 Oct", from the last dated stage — the vendor's own date, never a computed duration. */
export function timelineLabel(card: QuoteCardView): string | null {
  const last = [...card.stages].reverse().find((stage) => stage.endsOn !== null);
  if (last === undefined || last.endsOn === null) return null;
  const date = new Date(last.endsOn);
  if (Number.isNaN(date.getTime())) return `Ends ${last.endsOn}`;
  return `Ends ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(date)}`;
}

/** "Valid 6 more days" / "Runs out today". Null when the vendor set no validity. */
export function validityLabel(card: QuoteCardView): { text: string; urgent: boolean } | null {
  if (card.isExpired) return { text: "Price expired", urgent: true };
  if (card.validityDaysLeft === null) return null;
  if (card.validityDaysLeft === 0) return { text: "Runs out today", urgent: true };
  return {
    text: `Valid ${card.validityDaysLeft} more ${card.validityDaysLeft === 1 ? "day" : "days"}`,
    urgent: card.validityDaysLeft <= 2,
  };
}

const PREVIEW_INCLUSIONS = 4;

export function QuoteCard({
  card,
  index,
  detailHref,
  questionsHref,
  scopeGaps = [],
  onPick,
  isPicked,
  isChosen = false,
  onReject,
  onRequestRevision,
  onRevalidate,
  isRevalidating,
}: QuoteCardProps) {
  const headingId = `quote-${card.proposalId}`;
  const pickable = onPick !== undefined && card.isSelectable && !card.isExpired;
  const firstStage = firstStageOf(card);
  const timeline = timelineLabel(card);
  const validity = validityLabel(card);
  const openQuestions = card.questions.filter(
    (question) => question.askedByRole === "VENDOR" && question.answer === null,
  ).length;

  return (
    <article
      id={`estimate-${card.proposalId}`}
      aria-labelledby={headingId}
      className={cn(
        "scroll-mt-6 overflow-hidden rounded-[18px] bg-surface transition-shadow duration-base",
        isPicked || isChosen ? "shadow-raised ring-2 ring-selected" : "border border-line shadow-card",
      )}
    >
      {/* The summary is one label over a real radio, so the thing being judged
          is the tap target and the group stays keyboard-navigable. Secondary
          controls live below it, outside the label — a button inside a label is
          also activated by the label's own click. */}
      <label
        className={cn(
          "block p-4",
          pickable ? "cursor-pointer" : null,
          isPicked || isChosen ? "bg-selected-surface" : null,
        )}
      >
        <input
          type="radio"
          name="quote-choice"
          value={card.proposalId}
          checked={isPicked}
          disabled={!pickable}
          onChange={() => onPick?.(card.proposalId)}
          className="sr-only"
        />

        <header className="flex items-start gap-3">
          <VendorMark name={card.vendorName} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 id={headingId} className="text-base font-bold leading-tight text-text">
                {card.vendorName ?? `Estimate ${index + 1}`}
              </h3>
              {card.isVerified ? <Badge tone="success">Verified</Badge> : null}
              {isChosen ? <Badge tone="success">Chosen</Badge> : null}
              {card.isOutOfBudget ? <Badge tone="warning">Over budget</Badge> : null}
            </div>
            <VendorTrustLine trust={card.trust} className="mt-0.5" />
          </div>
          {pickable ? (
            <span
              aria-hidden
              className={cn(
                "mt-1 grid size-6 shrink-0 place-items-center rounded-full",
                isPicked ? "bg-selected" : "ring-2 ring-inset ring-warm-300",
              )}
            >
              {isPicked ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" className="size-3 text-text-inverse">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              ) : null}
            </span>
          ) : null}
        </header>

        <div className="mt-4 flex items-baseline justify-between gap-3">
          <p className="text-[26px] font-extrabold leading-none tracking-[-0.02em] text-text">
            {card.payableLabel}
          </p>
          <p className="text-right text-xs font-medium text-text-secondary">
            {card.taxBasis === "INCLUSIVE"
              ? `incl. ${card.taxLabel} tax`
              : `${card.totalLabel} + ${card.taxLabel} tax`}
          </p>
        </div>

        {card.rateLabel !== null ? (
          <p className="mt-2 text-sm text-text-secondary">
            {card.rateLabel} per worker per day
            {card.workerCount !== null ? ` · ${card.workerCount} workers` : ""}
            {card.minimumDays !== null
              ? ` · ${card.minimumDays === 1 ? "1 day" : `${card.minimumDays} days`} minimum`
              : ""}
          </p>
        ) : null}

        {firstStage !== null || timeline !== null ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Tile
              label="Pay to start"
              value={firstStage?.amountLabel ?? "Not stated"}
              hint={firstStage?.title ?? undefined}
            />
            <Tile label="Timeline" value={timeline ?? "Not dated"} />
          </div>
        ) : null}

        {card.inclusions.length > 0 || card.exclusions.length > 0 ? (
          <ul className="mt-3 grid list-none grid-cols-1 gap-x-3 gap-y-1 p-0 sm:grid-cols-2">
            {card.inclusions.slice(0, PREVIEW_INCLUSIONS).map((line) => (
              <ScopeLine key={`in-${line}`} included>
                {line}
              </ScopeLine>
            ))}
            {card.exclusions.slice(0, 1).map((line) => (
              <ScopeLine key={`out-${line}`} included={false}>
                {line}
              </ScopeLine>
            ))}
          </ul>
        ) : null}

        {scopeGaps.length > 0 ? (
          <p className="mt-3 rounded-[10px] border border-warning-line bg-warning-surface px-3 py-2 text-[13px] leading-5 text-text">
            <strong className="font-bold">Leaves out:</strong> {scopeGaps.slice(0, 3).join(", ")}
            {scopeGaps.length > 3 ? ` and ${scopeGaps.length - 3} more` : ""}
            <span className="text-text-secondary"> — the other estimates include these.</span>
          </p>
        ) : null}

        {card.isOutOfBudget ? (
          <p className="mt-3 text-[13px] leading-5 text-text-secondary">
            Above the budget you gave. Shown rather than hidden — they may be pricing something
            the cheaper estimates left out.
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
          {validity !== null ? (
            <span className={validity.urgent ? "text-warning-text" : "text-text-muted"}>
              {validity.urgent ? "⏱ " : ""}
              {validity.text}
            </span>
          ) : null}
          {card.revision > 1 ? <span className="text-text-muted">Revision {card.revision}</span> : null}
          {card.revisionRequest?.status === "OPEN" ? (
            <span className="text-info-text">Revision asked for</span>
          ) : null}
          {openQuestions > 0 ? (
            <span className="text-warning-text">
              {openQuestions === 1 ? "1 question for you" : `${openQuestions} questions for you`}
            </span>
          ) : null}
        </div>
      </label>

      {/* What the Customer buys — outside the radio's label, so opening the
          list does not also pick the estimate. Quantities and specs only;
          the list carries no prices by contract. */}
      {card.materialList.length > 0 ? (
        <div className="border-t border-line px-4 py-2">
          <Disclosure
            summary={`🛒 What you need to buy · ${materialCountLabel(card.materialList.length)}`}
          >
            <MaterialListRows rows={card.materialList} />
          </Disclosure>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <Link
          href={detailHref}
          className="inline-flex min-h-10 items-center rounded-control border border-line-strong bg-surface px-3.5 text-sm font-bold text-text hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          See full estimate
        </Link>
        <Link
          href={questionsHref}
          className="inline-flex min-h-10 items-center rounded-control px-3 text-sm font-bold text-text-link hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          Ask them
        </Link>
        {card.isExpired ? (
          card.hasAskedForRevalidation ? (
            <span className="text-sm text-text-secondary" role="status">
              Fresh price asked for
            </span>
          ) : onRevalidate !== undefined ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRevalidate(card.proposalId)}
              loading={isRevalidating}
              loadingLabel="Asking them"
            >
              Ask for a fresh price — free
            </Button>
          ) : null
        ) : (
          <>
            {onRequestRevision !== undefined && card.isSelectable && card.revisionRequest?.status !== "OPEN" ? (
              <Button size="sm" variant="ghost" onClick={() => onRequestRevision(card.proposalId)}>
                Ask for a revision
              </Button>
            ) : null}
            {onReject !== undefined && card.isSelectable ? (
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onReject(card.proposalId)}>
                Not this one
              </Button>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[12px] bg-surface-sunken px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">{label}</p>
      <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-text">{value}</p>
      {hint ? <p className="truncate text-xs text-text-secondary">{hint}</p> : null}
    </div>
  );
}

function ScopeLine({ included, children }: { included: boolean; children: string }) {
  return (
    <li className="flex items-start gap-1.5 text-[13px] leading-5 text-text-secondary">
      <span
        aria-hidden
        className={cn("mt-0.5 shrink-0 text-sm font-bold", included ? "text-success-text" : "text-warm-400")}
      >
        {included ? "✓" : "✗"}
      </span>
      <span className="min-w-0 truncate">{children}</span>
      <span className="sr-only">{included ? " (included)" : " (not included)"}</span>
    </li>
  );
}
