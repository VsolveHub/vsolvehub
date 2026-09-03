"use client";

import { Badge, Button, Disclosure, cn } from "@vsolve/ui";
import { MoreHorizontal, PackageCheck } from "lucide-react";
import Link from "next/link";

import {
  canAskAboutPrice,
  firstStageOf,
  materialCountLabel,
  superlativeFor,
  type QuoteCardView,
} from "../adapters";
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
   * Every estimate on the request, so the card can say what this one wins at.
   * Passed rather than derived because a superlative is a statement about the
   * set, and a card that only knows itself would have to claim "cheapest" on
   * the strength of nothing.
   */
  siblings?: readonly QuoteCardView[];

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
  /**
   * Opens the price ask. Withheld on a rate-card quote, where the figure is
   * the ops-published day rate and the vendor has nothing to give away.
   */
  onAskAboutPrice?: (proposalId: string) => void;
  /** `M2-FE-413` — offered only on an expired quote, and it charges nothing. */
  onRevalidate?: (proposalId: string) => void;
  isRevalidating: boolean;
}

/**
 * How long the job takes — "5 working days", or "Ends 14 Oct" when a stage is dated.
 *
 * A dated stage wins because it is the more specific promise. In practice there almost
 * never is one: the partner composer had no date input of any kind, so `ends_on` was
 * always null and this returned null, and every estimate on the platform rendered
 * "Not dated" in the slot where the answer belongs. `completionDays` (1.65.0) is what
 * vendors can actually state, and it is what a Customer is asking for anyway.
 */
export function timelineLabel(card: QuoteCardView): string | null {
  const last = [...card.stages].reverse().find((stage) => stage.endsOn !== null);
  if (last?.endsOn != null) {
    const date = new Date(last.endsOn);
    if (Number.isNaN(date.getTime())) return `Ends ${last.endsOn}`;
    return `Ends ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(date)}`;
  }
  if (card.completionDays !== null) {
    return `${card.completionDays} working ${card.completionDays === 1 ? "day" : "days"}`;
  }
  return null;
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
  siblings = [],
  onPick,
  isPicked,
  isChosen = false,
  onReject,
  onRequestRevision,
  onAskAboutPrice,
  onRevalidate,
  isRevalidating,
}: QuoteCardProps) {
  const headingId = `quote-${card.proposalId}`;
  const pickable = onPick !== undefined && card.isSelectable && !card.isExpired;
  const firstStage = firstStageOf(card);
  const timeline = timelineLabel(card);
  const validity = validityLabel(card);
  const superlative = superlativeFor(card, siblings);
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

        {/* The Four Facts.
            Fixed slots, same four questions, same order, on every card —
            including the cards where three of them are "Not stated". A grid
            that reflows to what a vendor happened to fill in cannot be
            compared by eye, and comparing by eye is the whole job of this
            screen. Emptiness is information too: an estimate with no date is
            visibly an estimate with no date, in the slot where the date goes. */}
        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3">
          <Fact
            label="Total"
            value={card.payableLabel}
            hint={
              card.taxBasis === "INCLUSIVE"
                ? `incl. ${card.taxLabel} tax`
                : `+ ${card.taxLabel} tax`
            }
            emphasis
          />
          <Fact
            label="To start"
            value={firstStage?.amountLabel ?? "Not stated"}
            // Vendors commonly name their first stage "To start", which is
            // also this slot's label — printing both stutters.
            hint={
              firstStage !== null && firstStage.title.toLowerCase() !== "to start"
                ? firstStage.title
                : undefined
            }
            emphasis
          />
          <Fact label="Takes" value={timeline ?? "Not stated"} />
          <Fact
            label="Holds for"
            value={validity?.text ?? "No end date"}
            urgent={validity?.urgent ?? false}
          />
        </dl>

        {card.rateLabel !== null ? (
          <p className="mt-3 text-sm text-text-secondary">
            {card.rateLabel} per worker per day
            {card.workerCount !== null ? ` · ${card.workerCount} workers` : ""}
            {card.minimumDays !== null
              ? ` · ${card.minimumDays === 1 ? "1 day" : `${card.minimumDays} days`} minimum`
              : ""}
          </p>
        ) : null}

        {/* One superlative, or none. `superlativeFor` refuses to award on a
            tie, so a badge here means an outright win on that axis. */}
        {superlative !== null ? (
          <p className="mt-3 inline-flex items-center rounded-full bg-success-surface px-2.5 py-1 text-xs font-extrabold text-success-text">
            {superlative.label}
          </p>
        ) : null}

        {card.materialFulfilmentMode === "PARTNER_TURNKEY" ? (
          <div className="mt-3 flex gap-2.5 rounded-[12px] border border-success-line bg-success-surface p-3 text-success-text">
            <PackageCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-bold">Materials, setup & removal included</p>
              <p className="mt-0.5 text-xs leading-5 text-text-secondary">
                The decorator handles the full supply. You only approve and pay the estimate.
              </p>
            </div>
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

        {/* Validity is not repeated here — it has a fixed slot in the Four
            Facts above, and saying it twice is how a card grows back into a
            paragraph. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
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
      {card.materialFulfilmentMode === "CUSTOMER_PROCURES" && card.materialList.length > 0 ? (
        <div className="border-t border-line px-4 py-2">
          <Disclosure
            summary={`What you need to buy · ${materialCountLabel(card.materialList.length)}`}
          >
            <MaterialListRows rows={card.materialList} />
          </Disclosure>
        </div>
      ) : null}

      {/* One way forward and a menu for the rest.
          This row carried four competing buttons — "See full estimate", "Ask
          them", "Ask for a revision", "Not this one" — none of which was the
          thing to do next. Reading the estimate is; everything else is a
          detour, and detours belong behind a menu. */}
      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        <Link
          href={detailHref}
          className="inline-flex min-h-10 items-center rounded-control border border-line-strong bg-surface px-3.5 text-sm font-bold text-text hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          Read in full <span aria-hidden className="ml-1.5 text-base leading-none">›</span>
        </Link>

        {card.isExpired && !card.hasAskedForRevalidation && onRevalidate !== undefined ? (
          // An expired price is the one case where the detour *is* the next
          // step, so it stays a button rather than hiding in the menu.
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRevalidate(card.proposalId)}
            loading={isRevalidating}
            loadingLabel="Asking them"
          >
            Ask for a fresh price — free
          </Button>
        ) : null}
        {card.isExpired && card.hasAskedForRevalidation ? (
          <span className="text-sm text-text-secondary" role="status">
            Fresh price asked for
          </span>
        ) : null}

        <CardOverflow
          card={card}
          questionsHref={questionsHref}
          onReject={onReject}
          onRequestRevision={onRequestRevision}
          onAskAboutPrice={onAskAboutPrice}
        />
      </div>
    </article>
  );
}

/**
 * The card's secondary actions, in a native disclosure.
 *
 * `<details>` rather than a popover on purpose: it is a disclosure, the
 * platform already makes it keyboard- and screen-reader-complete, and it works
 * before hydration on a screen a Customer may open on a slow connection while
 * standing in the room being painted.
 */
function CardOverflow({
  card,
  questionsHref,
  onReject,
  onRequestRevision,
  onAskAboutPrice,
}: {
  card: QuoteCardView;
  questionsHref: string;
  onReject?: (proposalId: string) => void;
  onRequestRevision?: (proposalId: string) => void;
  onAskAboutPrice?: (proposalId: string) => void;
}) {
  const priceAskable = onAskAboutPrice !== undefined && canAskAboutPrice(card);
  const revisable =
    onRequestRevision !== undefined &&
    card.isSelectable &&
    !card.isExpired &&
    card.revisionRequest?.status !== "OPEN";
  const rejectable = onReject !== undefined && card.isSelectable;

  return (
    <details className="group relative ml-auto">
      <summary
        aria-label={`More actions for ${card.vendorName ?? "this estimate"}`}
        className="inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-control text-text-secondary marker:content-none hover:bg-surface-hover hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal className="size-5" aria-hidden />
      </summary>
      <div className="absolute right-0 bottom-full z-20 mb-1 flex w-60 flex-col overflow-hidden rounded-[12px] border border-line bg-surface py-1 shadow-raised">
        <Link href={questionsHref} className={overflowItem}>
          Ask a question
        </Link>
        {priceAskable ? (
          <button type="button" className={overflowItem} onClick={() => onAskAboutPrice(card.proposalId)}>
            Ask about the price
          </button>
        ) : null}
        {revisable ? (
          <button type="button" className={overflowItem} onClick={() => onRequestRevision(card.proposalId)}>
            Ask for a change
          </button>
        ) : null}
        {rejectable ? (
          <button
            type="button"
            className={cn(overflowItem, "text-warning-text")}
            onClick={() => onReject(card.proposalId)}
          >
            Not this one
          </button>
        ) : null}
      </div>
    </details>
  );
}

const overflowItem =
  "px-3.5 py-2.5 text-left text-sm font-semibold text-text hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";

/**
 * One of the Four Facts.
 *
 * Always renders, even with nothing to say, because the comparison is
 * positional: the eye learns that "to start" is the top-right of every card
 * and stops reading labels. A slot that disappears when empty breaks that on
 * exactly the cards where it matters most.
 */
function Fact({
  label,
  value,
  hint,
  emphasis = false,
  urgent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  urgent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-muted">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 font-extrabold tabular-nums leading-tight",
          emphasis ? "text-[22px] tracking-[-0.02em]" : "text-[15px]",
          urgent ? "text-warning-text" : "text-text",
        )}
      >
        {value}
      </dd>
      {hint ? <p className="truncate text-xs font-medium text-text-secondary">{hint}</p> : null}
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
