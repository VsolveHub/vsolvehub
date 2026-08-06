"use client";

import type { Schemas } from "@vsolve/api-client";
import { Badge, Button, ErrorState } from "@vsolve/ui";

import type { GroupQuote, GroupQuoteUnit } from "../queries";
import { Money } from "./money";

/**
 * The immutable selected-plan quote.
 *
 * Every amount is a field. There is no subtotal computed from lines, no fee
 * split worked out from a percentage and no grand total assembled from parts:
 * the server allocated the platform fee across units in paise and sent both the
 * allocation and the total, so the screen renders them side by side without ever
 * needing them to agree by construction.
 *
 * Quote units are rendered exactly as the server grouped them. Merging two units
 * that happen to share a time, or splitting one that contains two services,
 * would make the review disagree with the thing being confirmed.
 */

const STATUS_TITLES: Record<Schemas["GroupQuoteStatusEnum"], string> = {
  ACTIVE: "",
  EXPIRED: "This price has expired",
  INVALIDATED: "This price no longer matches your booking",
  CONSUMED: "This price has already been used",
};

const STATUS_MESSAGES: Record<Schemas["GroupQuoteStatusEnum"], string> = {
  ACTIVE: "",
  EXPIRED:
    "Prices are held for a short time so they cannot drift while you decide. Nothing has been booked or charged.",
  INVALIDATED:
    "Your cart changed after this price was worked out. Nothing has been booked or charged.",
  CONSUMED: "It was already confirmed, so it cannot be used a second time.",
};

/** Line-kind copy, keyed by the generated enum so a new kind is a type error. */
const LINE_KIND_HINTS: Record<Schemas["QuoteLineKindEnum"], string | null> = {
  SERVICE: null,
  MINIMUM_VISIT_ADJUSTMENT: "Applies per visit",
  PLATFORM_FEE_ALLOCATION: "This visit's share of the one platform fee",
};

function QuoteUnitCard({ unit, index, total }: { unit: GroupQuoteUnit; index: number; total: number }) {
  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">
          Visit {index + 1} of {total}
        </h3>
        <Money value={unit.total} className="text-sm font-semibold tabular-nums text-text" />
      </div>

      <p className="mt-1 text-sm text-text-secondary">
        <time dateTime={unit.starts_at}>
          {new Date(unit.starts_at).toLocaleString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
        </time>
        {" · arrival window "}
        {unit.arrival_window_minutes} min · about {unit.estimated_duration_minutes} min of work
      </p>

      <dl className="mt-3 flex flex-col gap-1 text-sm">
        {unit.lines.map((line) => {
          const hint = LINE_KIND_HINTS[line.kind];
          return (
            <div key={line.id} className="flex justify-between gap-3">
              <dt className="text-text">
                {line.label}
                {line.quantity > 1 ? (
                  <span className="text-text-secondary"> × {line.quantity}</span>
                ) : null}
                {hint ? <span className="block text-text-secondary">{hint}</span> : null}
              </dt>
              <dd className="shrink-0 tabular-nums text-text">
                <Money value={line.amount} />
              </dd>
            </div>
          );
        })}
      </dl>
    </li>
  );
}

export interface QuoteReviewProps {
  quote: GroupQuote;
  visitCount: number;
  professionalCount: number;
  isConfirming: boolean;
  /** The confirm button's wording. Defaults to the neutral, non-payment phrasing. */
  confirmLabel?: string;
  /** A sentence under the button. Use it to say what confirming does *not* do. */
  confirmNote?: string;
  /** Set when the confirmation itself failed, already described for a person. */
  errorMessage: string | null;
  onConfirm: () => void;
  onBack: () => void;
  /** Returns to authoritative cart state when this quote can no longer be used. */
  onStartOver: () => void;
}

export function QuoteReview({
  quote,
  visitCount,
  professionalCount,
  isConfirming,
  confirmLabel = "Confirm booking",
  confirmNote,
  errorMessage,
  onConfirm,
  onBack,
  onStartOver,
}: QuoteReviewProps) {
  if (quote.status !== "ACTIVE") {
    return (
      <ErrorState
        severity="warning"
        title={STATUS_TITLES[quote.status]}
        message={STATUS_MESSAGES[quote.status]}
        actionLabel="Go back to my booking"
        onAction={onStartOver}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-text">Review your booking</h2>
          <p className="mt-1 text-sm text-text-secondary">
            {visitCount} {visitCount === 1 ? "visit" : "visits"} · {professionalCount}{" "}
            {professionalCount === 1 ? "professional" : "professionals"}
          </p>
        </div>
        <Badge tone="neutral">
          Held until{" "}
          <time dateTime={quote.expires_at}>
            {new Date(quote.expires_at).toLocaleTimeString("en-IN", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
        </Badge>
      </div>

      <ul className="mt-4 flex flex-col gap-3">
        {quote.units.map((unit, index) => (
          <QuoteUnitCard
            key={unit.id}
            unit={unit}
            index={index}
            total={quote.units.length}
          />
        ))}
      </ul>

      <div className="mt-4 flex items-baseline justify-between rounded-card border border-line-strong bg-surface p-4">
        <span className="text-base font-semibold text-text">Total</span>
        <Money value={quote.total} className="text-xl font-bold tabular-nums text-text" />
      </div>

      <p className="mt-2 text-sm text-text-secondary">
        Everything in this booking is confirmed together. If a professional cannot be
        found for one visit, none of it goes ahead and nothing is charged.
      </p>

      {errorMessage !== null ? (
        <p className="mt-4 text-sm text-critical" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={onConfirm} loading={isConfirming} loadingLabel="Confirming">
          {confirmLabel}
        </Button>
        <Button variant="ghost" onClick={onBack} disabled={isConfirming}>
          Change the times
        </Button>
      </div>

      {/* Load-bearing, not reassurance. Django's lifecycle is assign-then-pay:
          confirming dispatches offers and charges nothing, and payment opens
          only once every Partner has committed. Without this sentence the
          button reads as the end of the flow. */}
      {confirmNote === undefined ? null : (
        <p className="mt-3 text-sm text-text-secondary">{confirmNote}</p>
      )}
    </div>
  );
}
