"use client";

import type { Schemas } from "@vsolve/api-client";
import { ErrorState } from "@vsolve/ui";

import type { GroupQuote } from "../queries";

/**
 * Why a price stopped applying.
 *
 * A quote that is not `ACTIVE` is not a failure to retry through — it is a state
 * with a reason, and the reason is the useful part. A disabled Confirm button on
 * its own tells someone they cannot continue without telling them what happened
 * or what to do, which is the version of this screen that generates support
 * tickets.
 *
 * Every case says the same thing about money, because it is the first question:
 * nothing has been booked or charged.
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

export interface QuoteStatusNoticeProps {
  quote: GroupQuote;
  /** Works out a fresh price for the times already chosen. */
  onStartOver: () => void;
}

/** Renders nothing while the quote is usable. */
export function QuoteStatusNotice({ quote, onStartOver }: QuoteStatusNoticeProps) {
  if (quote.status === "ACTIVE") return null;

  return (
    <ErrorState
      severity="warning"
      title={STATUS_TITLES[quote.status]}
      message={STATUS_MESSAGES[quote.status]}
      actionLabel="Work out a fresh price"
      onAction={onStartOver}
    />
  );
}
